#!/usr/bin/env python3
"""Validate fixed-scale, fixed-anchor art-v2 exports for the full cast."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import tempfile
from pathlib import Path
from typing import Any

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
DEFAULT_ASSETS = REPO / "site/assets/art-v2"
EXPECTED_CANVAS = (384, 384)
EXPECTED_ANCHOR = (192, 350)
EXPECTED_RASTER_SCALE = 0.78
MAX_GROUND_DRIFT = 1

MEYER_LONGSWORD_ATTACKS = {
    "ls_l1", "ls_l2", "ls_l3", "ls_lh", "ls_l2h", "ls_h", "ls_hl",
    "ls_dodge_l", "ls_air_l", "ls_counter", "ls_switch_in", "ls_low_l", "ls_low_h",
}
MEYER_DUSSACK_ATTACKS = {
    "ds_l1", "ds_l2", "ds_l3", "ds_lh", "ds_l2h", "ds_h", "ds_hl",
    "ds_dodge_l", "ds_air_l", "ds_counter", "ds_switch_in", "ds_low_l", "ds_low_h",
}
MEYER_CLUB_ATTACKS = {"cl_l1", "cl_l2", "cl_h", "cl_throw"}
MEYER_SPEAR_ATTACKS = {"sp_l1", "sp_h", "sp_throw"}
MEYER_STATES = {
    "idle", "move", "crouch", "dodge", "block", "switch", "hitstun",
    "hitstun_head", "hitstun_torso", "hitstun_legs", "guardbreak", "dead",
}
THUG_STATES = {
    "idle", "move", "crouch", "dodge", "block", "hitstun",
    "hitstun_head", "hitstun_torso", "hitstun_legs", "guardbreak", "dead",
}
THUG_ATTACKS = {"thug_overhead", "thug_body", "thug_low"}
SPEAR_STATES = {"idle", "move", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "dead"}
SPEAR_ATTACKS = {"spear_thrust"}
CAPTAIN_STATES = {"idle", "move", "block", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "guardbreak", "dead"}
CAPTAIN_ATTACKS = {"captain_cut", "captain_bash"}
WRETCH_STATES = {"idle", "move", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "dead"}
WRETCH_ATTACKS = {"wretch_claw"}
GROTESQUE_STATES = {"idle", "move", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "dead"}
GROTESQUE_ATTACKS = {"boss_sweep", "boss_leap", "boss_shock"}

BONES = (
    ("rearShoulder", "rearElbow", "upperArm"),
    ("frontShoulder", "frontElbow", "upperArm"),
    ("rearElbow", "rearWrist", "forearm"),
    ("frontElbow", "frontWrist", "forearm"),
    ("rearHip", "rearKnee", "thigh"),
    ("frontHip", "frontKnee", "thigh"),
    ("rearKnee", "rearAnkle", "shin"),
    ("frontKnee", "frontAnkle", "shin"),
    ("pelvis", "chest", "torso"),
    ("chest", "neck", "neck"),
)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(131072), b""):
            value.update(chunk)
    return value.hexdigest()


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def expected_inventory() -> dict[tuple[str, str], set[str]]:
    return {
        ("meyer", "longsword"): MEYER_STATES | MEYER_LONGSWORD_ATTACKS,
        ("meyer", "dussack"): MEYER_STATES | MEYER_DUSSACK_ATTACKS,
        ("meyer", "club"): MEYER_STATES | MEYER_CLUB_ATTACKS,
        ("meyer", "spear"): MEYER_STATES | MEYER_SPEAR_ATTACKS,
        ("thug", "club"): THUG_STATES | THUG_ATTACKS,
        ("spear", "spear"): SPEAR_STATES | SPEAR_ATTACKS,
        ("captain", "captain-sword"): CAPTAIN_STATES | CAPTAIN_ATTACKS,
        ("wretch", "claws"): WRETCH_STATES | WRETCH_ATTACKS,
        ("grotesque", "claws"): GROTESQUE_STATES | GROTESQUE_ATTACKS,
    }


def validate(assets: Path) -> dict[str, Any]:
    errors: list[str] = []
    manifest_path = assets / "manifest-v2.json"
    if not manifest_path.is_file():
        raise SystemExit(f"Missing manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if tuple(manifest.get("canvas", ())) != EXPECTED_CANVAS:
        fail(errors, f"manifest canvas must be {EXPECTED_CANVAS}")

    source = assets / "source"
    rigs = {
        actor: json.loads((source / f"rigs/{actor}.json").read_text(encoding="utf-8"))
        for actor in ("meyer", "thug", "spear", "captain", "wretch", "grotesque")
    }
    for attachment in ("longsword", "dussack", "club", "spear", "captain-sword"):
        if not (source / f"weapons/{attachment}.json").is_file():
            fail(errors, f"missing separate weapon attachment: {attachment}")

    actual: dict[tuple[str, str], set[str]] = {}
    checksums: dict[str, str] = {}
    frame_count = 0
    min_margin = EXPECTED_CANVAS[0]
    max_ground_drift = 0
    for clip in manifest.get("clips", []):
        actor = clip.get("actor")
        weapon = clip.get("weapon")
        clip_id = clip.get("id")
        key = (actor, weapon)
        actual.setdefault(key, set()).add(clip_id)
        rig = rigs.get(actor)
        if rig is None:
            fail(errors, f"unknown actor in clip {clip_id}: {actor}")
            continue
        canonical_scale = rig["rootScale"]
        raster_scale = rig.get("rasterScale")
        canonical_anchor = tuple(rig["footAnchor"])
        if canonical_scale != 1.0:
            fail(errors, f"{actor}: canonical root scale must be exactly 1.0")
        if raster_scale != EXPECTED_RASTER_SCALE:
            fail(errors, f"{actor}: raster scale {raster_scale} != {EXPECTED_RASTER_SCALE}")
        if canonical_anchor != EXPECTED_ANCHOR:
            fail(errors, f"{actor}: canonical anchor {canonical_anchor} != {EXPECTED_ANCHOR}")
        if tuple(clip.get("canvas", ())) != EXPECTED_CANVAS:
            fail(errors, f"{actor}/{weapon}/{clip_id}: canvas metadata mismatch")
        if clip.get("rootScale") != canonical_scale:
            fail(errors, f"{actor}/{weapon}/{clip_id}: root-scale mismatch")
        if clip.get("rasterScale") != raster_scale:
            fail(errors, f"{actor}/{weapon}/{clip_id}: raster-scale mismatch")
        if tuple(clip.get("footAnchor", ())) != canonical_anchor:
            fail(errors, f"{actor}/{weapon}/{clip_id}: anchor mismatch")
        frames = clip.get("frames", [])
        if len(frames) != 6:
            fail(errors, f"{actor}/{weapon}/{clip_id}: expected 6 frames, got {len(frames)}")
        if clip.get("kind") == "attack":
            cues = [frame.get("cue") for frame in frames]
            for required in ("anticipation", "contact", "overshoot", "recovery"):
                if required not in cues:
                    fail(errors, f"{actor}/{weapon}/{clip_id}: missing {required} cue")
            if len([cue for cue in cues if cue == "contact"]) != 1:
                fail(errors, f"{actor}/{weapon}/{clip_id}: must have exactly one contact frame")
        for frame in frames:
            frame_count += 1
            relative = frame.get("file", "")
            path = assets / relative
            if not path.is_file():
                fail(errors, f"missing frame: {relative}")
                continue
            if frame.get("rootScale") != canonical_scale:
                fail(errors, f"{relative}: per-frame root-scale mismatch")
            if frame.get("rasterScale") != raster_scale:
                fail(errors, f"{relative}: per-frame raster-scale mismatch")
            if tuple(frame.get("footAnchor", ())) != canonical_anchor:
                fail(errors, f"{relative}: per-frame anchor mismatch")
            with Image.open(path) as image:
                if image.size != EXPECTED_CANVAS:
                    fail(errors, f"{relative}: canvas {image.size} != {EXPECTED_CANVAS}")
                if image.mode != "RGBA":
                    fail(errors, f"{relative}: transparency mode must be RGBA, got {image.mode}")
                    image = image.convert("RGBA")
                alpha = image.getchannel("A")
                alpha_min, alpha_max = alpha.getextrema()
                bbox = alpha.getbbox()
                if alpha_min != 0 or alpha_max != 255:
                    fail(errors, f"{relative}: transparency failure (alpha extrema {alpha_min},{alpha_max})")
                if bbox is None:
                    fail(errors, f"{relative}: empty sprite")
                else:
                    if bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= EXPECTED_CANVAS[0]:
                        fail(errors, f"{relative}: transparent safety margin failure {bbox}")
                    drift = abs((bbox[3] - 1) - EXPECTED_ANCHOR[1])
                    max_ground_drift = max(max_ground_drift, drift)
                    if drift > MAX_GROUND_DRIFT:
                        fail(errors, f"{relative}: grounded-anchor drift {drift}px from row {EXPECTED_ANCHOR[1]}")
                    min_margin = min(min_margin, bbox[0], bbox[1], EXPECTED_CANVAS[0] - bbox[2])
                corners = (alpha.getpixel((0, 0)), alpha.getpixel((383, 0)), alpha.getpixel((0, 383)), alpha.getpixel((383, 383)))
                if corners != (0, 0, 0, 0):
                    fail(errors, f"{relative}: opaque canvas corner")
            actual_hash = digest(path)
            checksums[relative] = actual_hash
            if frame.get("sha256") != actual_hash:
                fail(errors, f"{relative}: checksum mismatch")

            landmarks = frame.get("landmarks", {})
            for start_name, end_name, proportion_name in BONES:
                start = landmarks.get(start_name)
                end = landmarks.get(end_name)
                if start is None or end is None:
                    fail(errors, f"{relative}: missing landmark {start_name}/{end_name}")
                    continue
                measured = math.hypot(end[0] - start[0], end[1] - start[1])
                expected = rig["proportions"][proportion_name] * raster_scale
                if abs(measured - expected) > 0.01:
                    fail(errors, f"{relative}: {proportion_name} drift {measured:.3f}px != {expected}px")

    for key, expected in expected_inventory().items():
        missing = sorted(expected - actual.get(key, set()))
        if missing:
            fail(errors, f"{key[0]}/{key[1]} missing clips: {', '.join(missing)}")

    summary = {
        "passed": not errors,
        "clipCount": sum(len(values) for values in actual.values()),
        "frameCount": frame_count,
        "canvas": list(EXPECTED_CANVAS),
        "rootScale": 1.0,
        "rasterScale": EXPECTED_RASTER_SCALE,
        "footAnchor": list(EXPECTED_ANCHOR),
        "maxGroundDriftPx": max_ground_drift,
        "minimumSafetyMarginPx": min_margin,
        "checksumCount": len(checksums),
        "errors": errors,
    }
    return summary


def verify_rebuild(assets: Path, summary: dict[str, Any]) -> None:
    # Import the generator by path so its hyphenated filename stays CLI-friendly.
    import importlib.util
    import sys

    generator_path = REPO / "tools/generate-fixed-rig-art-v2.py"
    spec = importlib.util.spec_from_file_location("fixed_rig_generator", generator_path)
    if spec is None or spec.loader is None:
        summary["errors"].append("could not load generator for deterministic rebuild")
        summary["passed"] = False
        return
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix="fixed-rig-v2-") as directory:
        rebuilt = Path(directory) / "art-v2"
        module.generate(rebuilt, clean=True)
        original = json.loads((assets / "manifest-v2.json").read_text(encoding="utf-8"))
        generated = json.loads((rebuilt / "manifest-v2.json").read_text(encoding="utf-8"))
        original_hashes = {frame["file"]: frame["sha256"] for clip in original["clips"] for frame in clip["frames"]}
        generated_hashes = {frame["file"]: frame["sha256"] for clip in generated["clips"] for frame in clip["frames"]}
        if original_hashes != generated_hashes:
            summary["errors"].append("deterministic rebuild checksums differ")
            summary["passed"] = False
        summary["deterministicRebuild"] = original_hashes == generated_hashes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--verify-rebuild", action="store_true")
    args = parser.parse_args()
    summary = validate(args.assets.resolve())
    if args.verify_rebuild and summary["passed"]:
        verify_rebuild(args.assets.resolve(), summary)
    print(json.dumps(summary, indent=2))
    if not summary["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
