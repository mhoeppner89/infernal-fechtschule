#!/usr/bin/env python3
"""Generate deterministic, bottom-anchored attack recovery frames.

Every current attack already has two anticipation keys, one contact key, and a
single recovery key (01..04). This tool preserves those source files exactly and
adds a short overshoot followed by damped settle poses (05 onward). The motion
is an x-only shear around the source sprite's alpha baseline: the upper body and
weapon follow through while the feet keep the same vertical registration.

The matching runtime WebPs are resized to the existing clip's WebP canvas and
saved losslessly. Use --validate-only to check an existing generated set without
rewriting it, and --preview-dir to make complete contact/recovery sheets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw


ART_ROOT = Path("art-source/v1")  # v1 source tree, outside the shipped site/
MAX_POSE_HOLD_SECONDS = 0.120
MIN_RECOVERY_POSES = 3
OVERSHOOT_HOLD_TICKS = 3
SETTLE_HOLD_TICKS = 7
POSE_HOLD_EPSILON = 1e-9
GENERATED_FRAME_START = 5
SOURCE_CONTACT_FRAME = 3
SOURCE_RECOVERY_FRAME = 4
ALPHA_THRESHOLD = 4
WEBP_SAVE_OPTIONS = {
    "format": "WEBP",
    "lossless": True,
    "quality": 100,
    "method": 6,
    "exact": True,
}


@dataclass(frozen=True)
class AttackSpec:
    attack_id: str
    relative_dir: str
    recovery_seconds: float
    display_height: int

    @property
    def clip_dir(self) -> Path:
        return ART_ROOT / self.relative_dir

    @property
    def recovery_pose_count(self) -> int:
        frame_count = MIN_RECOVERY_POSES
        while (
            self.recovery_seconds
            * SETTLE_HOLD_TICKS
            / (OVERSHOOT_HOLD_TICKS + SETTLE_HOLD_TICKS * (frame_count - 1))
            > MAX_POSE_HOLD_SECONDS + POSE_HOLD_EPSILON
        ):
            frame_count += 1
        return frame_count

    @property
    def final_generated_frame_number(self) -> int:
        """The last numbered frame generated after the four authored keys."""
        return GENERATED_FRAME_START + self.recovery_pose_count - 2


# Recovery values mirror src/sim/attacks.ts. Keeping the list here makes this
# asset tool deterministic and usable without compiling the game first.
ATTACKS: tuple[AttackSpec, ...] = (
    AttackSpec("ls_l1", "meyer/longsword/ls_l1", 0.16, 188),
    AttackSpec("ls_l2", "meyer/longsword/ls_l2", 0.18, 188),
    AttackSpec("ls_l3", "meyer/longsword/ls_l3", 0.28, 188),
    AttackSpec("ls_lh", "meyer/longsword/ls_lh", 0.31, 188),
    AttackSpec("ls_l2h", "meyer/longsword/ls_l2h", 0.36, 188),
    AttackSpec("ls_h", "meyer/longsword/ls_h", 0.31, 188),
    AttackSpec("ls_hl", "meyer/longsword/ls_hl", 0.24, 188),
    AttackSpec("ls_dodge_l", "meyer/longsword/ls_dodge_l", 0.23, 188),
    AttackSpec("ls_air_l", "meyer/longsword/ls_air_l", 0.30, 188),
    AttackSpec("ls_counter", "meyer/longsword/ls_counter", 0.25, 188),
    AttackSpec("ls_switch_in", "meyer/longsword/ls_switch_in", 0.22, 188),
    AttackSpec("ds_l1", "meyer/dussack/ds_l1", 0.12, 188),
    AttackSpec("ds_l2", "meyer/dussack/ds_l2", 0.13, 188),
    AttackSpec("ds_l3", "meyer/dussack/ds_l3", 0.20, 188),
    AttackSpec("ds_lh", "meyer/dussack/ds_lh", 0.23, 188),
    AttackSpec("ds_l2h", "meyer/dussack/ds_l2h", 0.23, 188),
    AttackSpec("ds_h", "meyer/dussack/ds_h", 0.26, 188),
    AttackSpec("ds_hl", "meyer/dussack/ds_hl", 0.15, 188),
    AttackSpec("ds_dodge_l", "meyer/dussack/ds_dodge_l", 0.18, 188),
    AttackSpec("ds_air_l", "meyer/dussack/ds_air_l", 0.24, 188),
    AttackSpec("ds_counter", "meyer/dussack/ds_counter", 0.20, 188),
    AttackSpec("ds_switch_in", "meyer/dussack/ds_switch_in", 0.18, 188),
    AttackSpec("thug_overhead", "enemies/thug/thug_overhead", 0.67, 174),
    AttackSpec("spear_thrust", "enemies/spear/spear_thrust", 0.86, 181),
    AttackSpec("captain_cut", "enemies/captain/captain_cut", 0.72, 196),
    AttackSpec("captain_bash", "enemies/captain/captain_bash", 0.52, 196),
    AttackSpec("wretch_claw", "enemies/wretch/wretch_claw", 0.50, 162),
    AttackSpec("boss_sweep", "enemies/grotesque/boss_sweep", 0.88, 278),
    AttackSpec("boss_leap", "enemies/grotesque/boss_leap", 0.90, 278),
    AttackSpec("boss_shock", "enemies/grotesque/boss_shock", 1.00, 278),
)


def settle_factors(frame_count: int) -> list[float]:
    """One restrained rebound followed by a monotonic return, never jitter."""
    if frame_count <= 0:
        return []
    start = min(0.22, 0.10 + 0.03 * (frame_count - 1))
    return [-(start * (0.68**index)) for index in range(frame_count)]


def visible_pixels(image: Image.Image) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    ys, xs = np.nonzero(alpha > ALPHA_THRESHOLD)
    if len(xs) == 0:
        raise ValueError("sprite has no visible pixels")
    return alpha, ys, xs


def alpha_baseline(image: Image.Image) -> int:
    _, ys, _ = visible_pixels(image)
    return int(ys.max())


def upper_alpha_centroid_x(image: Image.Image) -> float:
    alpha, ys, xs = visible_pixels(image)
    top = int(ys.min())
    bottom = int(ys.max())
    upper_limit = top + round((bottom - top) * 0.78)
    selection = ys <= upper_limit
    selected_xs = xs[selection]
    selected_ys = ys[selection]
    weights = alpha[selected_ys, selected_xs].astype(np.float64)
    return float(np.average(selected_xs, weights=weights))


def motion_direction(spec: AttackSpec, anticipation: Image.Image, contact: Image.Image) -> int:
    delta = upper_alpha_centroid_x(contact) - upper_alpha_centroid_x(anticipation)
    if abs(delta) >= 1.5:
        return 1 if delta > 0 else -1
    digest = hashlib.sha256(spec.attack_id.encode("utf-8")).digest()
    return 1 if digest[0] % 2 == 0 else -1


def safe_shear_limit(image: Image.Image, direction: int, baseline: int) -> float:
    _, ys, xs = visible_pixels(image)
    lever = baseline - ys
    active = lever > 0
    if not np.any(active):
        return 0.0
    lever = lever[active].astype(np.float64)
    xs = xs[active].astype(np.float64)
    if direction > 0:
        room = (image.width - 2) - xs
    else:
        room = xs - 1
    valid = room >= 0
    if not np.any(valid):
        return 0.0
    return max(0.0, float(np.min(room[valid] / lever[valid])))


def transform_shear(image: Image.Image, shear: float, baseline: int) -> Image.Image:
    # Pillow affine coefficients map output coordinates back to the source.
    return image.transform(
        image.size,
        Image.Transform.AFFINE,
        (1.0, shear, -shear * baseline, 0.0, 1.0, 0.0),
        resample=Image.Resampling.BICUBIC,
        fillcolor=(0, 0, 0, 0),
    )


def preserve_anchor_row(
    transformed: Image.Image, source: Image.Image, baseline: int
) -> Image.Image:
    """Keep the exact source pixels on the invariant floor row.

    Bicubic filtering can reduce a sparse antialiased foot pixel below the
    alpha threshold even though the affine transform leaves that row fixed.
    Restoring the row prevents a one-pixel foot twitch and keeps the runtime
    registration deterministic across every generated pose.
    """
    transformed_pixels = np.asarray(transformed).copy()
    source_pixels = np.asarray(source)
    transformed_pixels[baseline, :, :] = source_pixels[baseline, :, :]
    return Image.fromarray(transformed_pixels, mode="RGBA")


def alpha_mass(image: Image.Image) -> int:
    return int(np.asarray(image.getchannel("A"), dtype=np.uint64).sum())


def low_band_centroid_x(image: Image.Image) -> float:
    alpha, ys, xs = visible_pixels(image)
    top = int(ys.min())
    bottom = int(ys.max())
    band_top = bottom - max(3, round((bottom - top) * 0.08))
    selection = ys >= band_top
    selected_xs = xs[selection]
    selected_ys = ys[selection]
    weights = alpha[selected_ys, selected_xs].astype(np.float64)
    return float(np.average(selected_xs, weights=weights))


def resized_visual_difference(first: Image.Image, second: Image.Image) -> float:
    first_small = np.asarray(
        first.resize((180, 180), Image.Resampling.LANCZOS), dtype=np.int16
    )
    second_small = np.asarray(
        second.resize((180, 180), Image.Resampling.LANCZOS), dtype=np.int16
    )
    return float(np.abs(first_small - second_small).mean())


def generated_frame_paths(spec: AttackSpec) -> Iterable[tuple[int, Path, Path]]:
    for frame_number in range(
        GENERATED_FRAME_START, spec.final_generated_frame_number + 1
    ):
        yield (
            frame_number,
            spec.clip_dir / f"{frame_number:02d}.png",
            spec.clip_dir / f"{frame_number:02d}.webp",
        )


def obsolete_generated_frame_paths(spec: AttackSpec) -> list[Path]:
    """Return only stale numbered outputs in this exact attack folder.

    The source keys (01..04), non-numbered art, and every other asset folder are
    intentionally outside this cleanup scope.
    """
    if not spec.clip_dir.is_dir():
        return []
    return sorted(
        path
        for path in spec.clip_dir.iterdir()
        if path.is_file()
        and path.suffix in {".png", ".webp"}
        and len(path.stem) == 2
        and path.stem.isdigit()
        and GENERATED_FRAME_START <= int(path.stem)
        and int(path.stem) > spec.final_generated_frame_number
    )


def remove_obsolete_generated_frames(spec: AttackSpec) -> list[Path]:
    removed = obsolete_generated_frame_paths(spec)
    for path in removed:
        path.unlink()
    return removed


def playback_frame_numbers(spec: AttackSpec) -> list[int]:
    """Contact, overshoot, authored recovery, then every generated settle."""
    return [
        SOURCE_CONTACT_FRAME,
        GENERATED_FRAME_START,
        SOURCE_RECOVERY_FRAME,
        *range(SOURCE_RECOVERY_FRAME + 2, spec.final_generated_frame_number + 1),
    ]


def save_runtime_webp(source: Image.Image, output: Path, runtime_size: tuple[int, int]) -> None:
    runtime = source.resize(runtime_size, Image.Resampling.LANCZOS)
    runtime.save(output, **WEBP_SAVE_OPTIONS)


def generate_clip(spec: AttackSpec) -> dict[str, object]:
    anticipation_path = spec.clip_dir / "02.png"
    contact_path = spec.clip_dir / f"{SOURCE_CONTACT_FRAME:02d}.png"
    recovery_path = spec.clip_dir / f"{SOURCE_RECOVERY_FRAME:02d}.png"
    runtime_reference_path = spec.clip_dir / f"{SOURCE_RECOVERY_FRAME:02d}.webp"
    for path in (anticipation_path, contact_path, recovery_path, runtime_reference_path):
        if not path.is_file():
            raise FileNotFoundError(path)

    anticipation = Image.open(anticipation_path).convert("RGBA")
    contact = Image.open(contact_path).convert("RGBA")
    recovery = Image.open(recovery_path).convert("RGBA")
    runtime_reference = Image.open(runtime_reference_path).convert("RGBA")
    if contact.size != recovery.size:
        raise ValueError(f"{spec.attack_id}: contact/recovery canvas mismatch")

    if anticipation.size != contact.size:
        raise ValueError(f"{spec.attack_id}: anticipation/contact canvas mismatch")

    contact_baseline = alpha_baseline(contact)
    contact_top = int(visible_pixels(contact)[1].min())
    contact_lever = max(1, contact_baseline - contact_top)
    direction = motion_direction(spec, anticipation, contact)
    target_logical_displacement = 7.0
    requested_amplitude = min(
        0.055,
        max(
            0.035,
            target_logical_displacement
            / (contact_lever * spec.display_height / contact.height),
        ),
    )
    same_way_limit = safe_shear_limit(contact, direction, contact_baseline) * 0.88
    amplitude = min(requested_amplitude, same_way_limit)
    if amplitude < 0.020:
        raise ValueError(
            f"{spec.attack_id}: insufficient transparent margin for visible follow-through "
            f"({amplitude:.4f})"
        )

    generated: list[dict[str, object]] = []
    frame_paths = list(generated_frame_paths(spec))
    recovery_baseline = alpha_baseline(recovery)
    recovery_settles = settle_factors(spec.recovery_pose_count - 2)
    for generated_index, (frame_number, png_path, webp_path) in enumerate(frame_paths):
        is_overshoot = frame_number == 5
        source = contact if is_overshoot else recovery
        source_baseline = contact_baseline if is_overshoot else recovery_baseline
        factor = 1.0 if is_overshoot else recovery_settles[generated_index - 1]
        shear = direction * amplitude * factor
        frame = preserve_anchor_row(
            transform_shear(source, shear, source_baseline), source, source_baseline
        )
        frame.save(png_path, format="PNG", optimize=True)
        save_runtime_webp(frame, webp_path, runtime_reference.size)

        baseline_delta = alpha_baseline(frame) - source_baseline
        low_x_delta_logical = abs(low_band_centroid_x(frame) - low_band_centroid_x(source)) * (
            spec.display_height / source.height
        )
        mass_ratio = alpha_mass(frame) / alpha_mass(source)
        generated.append(
            {
                "frame": frame_number,
                "sourceFrame": 3 if is_overshoot else 4,
                "shear": round(shear, 6),
                "baselineDeltaPx": baseline_delta,
                "bottomAnchorDeltaLogicalPx": round(low_x_delta_logical, 3),
                "alphaMassRatio": round(mass_ratio, 6),
            }
        )

    return {
        "attackId": spec.attack_id,
        "relativeDir": spec.relative_dir,
        "recoverySeconds": spec.recovery_seconds,
        "recoveryPoses": spec.recovery_pose_count,
        "generatedFrames": spec.recovery_pose_count - 1,
        "sourceSize": list(recovery.size),
        "runtimeSize": list(runtime_reference.size),
        "direction": direction,
        "amplitude": round(amplitude, 6),
        "frames": generated,
    }


def validate_clip(spec: AttackSpec) -> dict[str, object]:
    original_paths = [spec.clip_dir / f"{number:02d}.png" for number in range(1, 5)]
    original_webps = [spec.clip_dir / f"{number:02d}.webp" for number in range(1, 5)]
    for path in (*original_paths, *original_webps):
        if not path.is_file():
            raise FileNotFoundError(path)

    obsolete = obsolete_generated_frame_paths(spec)
    if obsolete:
        names = ", ".join(path.name for path in obsolete)
        raise ValueError(
            f"{spec.attack_id}: stale generated frames outside the recovery formula: {names}"
        )

    contact = Image.open(original_paths[2]).convert("RGBA")
    recovery = Image.open(original_paths[3]).convert("RGBA")
    runtime_reference = Image.open(original_webps[3]).convert("RGBA")
    hashes = {
        hashlib.sha256(contact.tobytes()).hexdigest(),
        hashlib.sha256(recovery.tobytes()).hexdigest(),
    }
    frames: list[dict[str, object]] = []

    for frame_number, png_path, webp_path in generated_frame_paths(spec):
        if not png_path.is_file() or not webp_path.is_file():
            raise FileNotFoundError(f"{spec.attack_id}: missing frame {frame_number:02d}")
        frame = Image.open(png_path).convert("RGBA")
        runtime = Image.open(webp_path).convert("RGBA")
        source = contact if frame_number == 5 else recovery
        source_baseline = alpha_baseline(source)
        source_low_x = low_band_centroid_x(source)
        source_mass = alpha_mass(source)
        if frame.size != source.size:
            raise ValueError(f"{png_path}: source canvas changed to {frame.size}")
        if runtime.size != runtime_reference.size:
            raise ValueError(f"{webp_path}: runtime canvas changed to {runtime.size}")
        if alpha_baseline(frame) != source_baseline:
            raise ValueError(f"{png_path}: alpha baseline moved")
        if frame.getbbox() is None or runtime.getbbox() is None:
            raise ValueError(f"{png_path}: empty generated pose")

        digest = hashlib.sha256(frame.tobytes()).hexdigest()
        if digest in hashes:
            raise ValueError(f"{png_path}: recovery pose is not distinct")
        hashes.add(digest)
        low_x_delta_logical = abs(low_band_centroid_x(frame) - source_low_x) * (
            spec.display_height / recovery.height
        )
        if low_x_delta_logical > 3.0:
            raise ValueError(
                f"{png_path}: bottom anchor drift {low_x_delta_logical:.2f} logical px"
            )
        mass_ratio = alpha_mass(frame) / source_mass
        if not 0.995 <= mass_ratio <= 1.005:
            raise ValueError(f"{png_path}: likely clipped alpha ({mass_ratio:.5f})")
        frames.append(
            {
                "frame": frame_number,
                "sourceFrame": 3 if frame_number == 5 else 4,
                "bottomAnchorDeltaLogicalPx": round(low_x_delta_logical, 3),
                "alphaMassRatio": round(mass_ratio, 6),
            }
        )

    playback_numbers = playback_frame_numbers(spec)
    playback_images = [
        Image.open(spec.clip_dir / f"{frame_number:02d}.png").convert("RGBA")
        for frame_number in playback_numbers
    ]
    visual_deltas = [
        resized_visual_difference(first, second)
        for first, second in zip(playback_images, playback_images[1:])
    ]
    if visual_deltas[0] < 0.10:
        raise ValueError(
            f"{spec.attack_id}: first overshoot is not visible at 180 px "
            f"({visual_deltas[0]:.3f})"
        )
    settle_deltas = visual_deltas[2:]
    if any(visual_delta < 0.01 for visual_delta in settle_deltas):
        raise ValueError(
            f"{spec.attack_id}: a settle pose is indistinguishable at 180 px "
            f"({[round(value, 3) for value in settle_deltas]})"
        )
    for previous, current in zip(settle_deltas, settle_deltas[1:]):
        if current > previous * 1.25 + 0.01:
            raise ValueError(
                f"{spec.attack_id}: damped settle row jitters at 180 px "
                f"({previous:.3f} -> {current:.3f})"
            )
    total_hold_ticks = OVERSHOOT_HOLD_TICKS + SETTLE_HOLD_TICKS * (
        spec.recovery_pose_count - 1
    )
    max_hold_seconds = (
        spec.recovery_seconds * SETTLE_HOLD_TICKS / total_hold_ticks
    )
    if max_hold_seconds > MAX_POSE_HOLD_SECONDS + 1e-9:
        raise ValueError(f"{spec.attack_id}: recovery pose hold is {max_hold_seconds:.3f}s")
    if spec.recovery_seconds > 0.25 and spec.recovery_pose_count < 2:
        raise ValueError(f"{spec.attack_id}: needs at least two recovery poses")
    if spec.recovery_seconds > 0.5 and spec.recovery_pose_count < 3:
        raise ValueError(f"{spec.attack_id}: needs at least three recovery poses")

    return {
        "attackId": spec.attack_id,
        "recoveryPoses": spec.recovery_pose_count,
        "maxNominalPoseHoldMs": round(max_hold_seconds * 1000, 1),
            "playbackOrder": playback_numbers,
        "playbackVisualDeltasAt180": [round(value, 3) for value in visual_deltas],
        "frames": frames,
    }


def preview_group(spec: AttackSpec) -> str:
    if spec.relative_dir.startswith("meyer/longsword"):
        return "meyer-longsword"
    if spec.relative_dir.startswith("meyer/dussack"):
        return "meyer-dussack"
    return "enemies"


def write_preview_sheets(preview_dir: Path) -> list[Path]:
    preview_dir.mkdir(parents=True, exist_ok=True)
    groups: dict[str, list[AttackSpec]] = {}
    for spec in ATTACKS:
        groups.setdefault(preview_group(spec), []).append(spec)

    output_paths: list[Path] = []
    thumb_size = 126
    label_width = 270
    header_height = 34
    row_height = 158
    max_pose_count = max(spec.recovery_pose_count for spec in ATTACKS)
    columns = 1 + max_pose_count  # contact plus every recovery pose
    for group, specs in groups.items():
        sheet = Image.new(
            "RGB",
            (label_width + columns * thumb_size, header_height + len(specs) * row_height),
            (232, 222, 196),
        )
        draw = ImageDraw.Draw(sheet)
        draw.text((8, 10), f"{group}: contact + complete recovery", fill=(48, 36, 27))
        for column in range(columns):
            if column == 0:
                cue = "03 contact"
            elif column == 1:
                cue = "05 overshoot"
            elif column == 2:
                cue = "04 recovery"
            else:
                cue = f"{column + 3:02d} settle"
            draw.text(
                (label_width + column * thumb_size + 6, 10), cue, fill=(79, 60, 43)
            )
        for row, spec in enumerate(specs):
            top = header_height + row * row_height
            baseline = top + row_height - 8
            draw.line((0, top, sheet.width, top), fill=(183, 167, 134), width=1)
            draw.line(
                (label_width, baseline, sheet.width, baseline),
                fill=(158, 139, 108),
                width=1,
            )
            draw.text((8, top + 12), spec.attack_id, fill=(48, 36, 27))
            draw.text(
                (8, top + 34),
                f"{spec.recovery_seconds:.2f}s / {spec.recovery_pose_count} poses",
                fill=(93, 70, 49),
            )
            frame_numbers = playback_frame_numbers(spec)
            for column, frame_number in enumerate(frame_numbers):
                frame_path = spec.clip_dir / f"{frame_number:02d}.png"
                frame = Image.open(frame_path).convert("RGBA")
                frame.thumbnail((thumb_size - 8, thumb_size - 8), Image.Resampling.LANCZOS)
                cell_left = label_width + column * thumb_size
                x = cell_left + (thumb_size - frame.width) // 2
                y = baseline - frame.height
                sheet.paste(frame, (x, y), frame)
        output_path = preview_dir / f"{group}.png"
        sheet.save(output_path, format="PNG", optimize=True)
        output_paths.append(output_path)
    return output_paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="validate the expected generated files without rewriting them",
    )
    parser.add_argument(
        "--preview-dir",
        type=Path,
        help="write complete contact/recovery sheets grouped by fighter",
    )
    parser.add_argument(
        "--report",
        type=Path,
        help="write the machine-readable validation report as JSON",
    )
    args = parser.parse_args()

    if len(ATTACKS) != 30:
        raise SystemExit(f"expected 30 current attacks, configured {len(ATTACKS)}")

    if not args.validate_only:
        removed_paths = [
            path
            for spec in ATTACKS
            for path in remove_obsolete_generated_frames(spec)
        ]
        if removed_paths:
            print(
                f"removed {len(removed_paths)} stale generated frame files from the 30 attack folders"
            )
        generated_reports = [generate_clip(spec) for spec in ATTACKS]
        generated_total = sum(int(report["generatedFrames"]) for report in generated_reports)
        print(f"generated {generated_total} PNG/WebP recovery frame pairs across 30 attacks")

    validation = [validate_clip(spec) for spec in ATTACKS]
    preview_paths = write_preview_sheets(args.preview_dir) if args.preview_dir else []
    report = {
        "attackCount": len(ATTACKS),
        "generatedFramePairs": sum(spec.recovery_pose_count - 1 for spec in ATTACKS),
        "recoveryPoseRange": [
            min(spec.recovery_pose_count for spec in ATTACKS),
            max(spec.recovery_pose_count for spec in ATTACKS),
        ],
        "maxAllowedPoseHoldMs": MAX_POSE_HOLD_SECONDS * 1000,
        "clips": validation,
        "previewSheets": [str(path) for path in preview_paths],
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"validated {len(ATTACKS)} attacks; recovery poses "
        f"{report['recoveryPoseRange'][0]}..{report['recoveryPoseRange'][1]}; "
        f"{report['generatedFramePairs']} generated frame pairs"
    )
    for path in preview_paths:
        print(f"preview: {path}")


if __name__ == "__main__":
    main()
