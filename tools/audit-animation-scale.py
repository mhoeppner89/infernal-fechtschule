#!/usr/bin/env python3
"""Audit apparent character scale across normalized runtime animation frames.

The metric counts alpha-weighted, non-white character ink. Bright low-saturation
pixels are omitted so sword blades and motion arcs do not make an actor appear
larger than its body. Idle frames define the target mass for each character.
"""

from __future__ import annotations

import argparse
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ART_ROOT = Path("site/assets/art")
LOW_CORRECTION = 0.78
HIGH_CORRECTION = 1.55


def character_key(path: Path) -> str:
    parts = path.relative_to(ART_ROOT).parts
    if parts[0] == "meyer":
        return "meyer"
    if parts[0] == "enemies" and len(parts) >= 2:
        return parts[1]
    raise ValueError(f"unrecognized animation path: {path}")


def ink_mass(path: Path) -> float:
    rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32)
    rgb = rgba[:, :, :3]
    alpha = rgba[:, :, 3] / 255.0
    maximum = rgb.max(axis=2)
    minimum = rgb.min(axis=2)
    saturation = np.divide(
        maximum - minimum,
        np.maximum(maximum, 1.0),
        out=np.zeros_like(maximum),
        where=maximum > 0,
    )
    luminance = rgb[:, :, 0] * 0.2126 + rgb[:, :, 1] * 0.7152 + rgb[:, :, 2] * 0.0722
    bright_neutral = (luminance > 205.0) & (saturation < 0.16)
    visible = (alpha > 0.05) & ~bright_neutral
    return float(alpha[visible].sum())


def median(values: list[float]) -> float:
    return float(np.median(np.asarray(values, dtype=np.float64)))


def preview_group(clip: Path) -> str:
    parts = clip.relative_to(ART_ROOT).parts
    if parts[0] == "meyer":
        return f"meyer-{parts[1]}"
    return parts[1]


def write_preview_sheets(
    masses_by_clip: dict[Path, list[float]],
    correction_by_clip: dict[Path, float],
    output_dir: Path,
) -> None:
    groups: dict[str, list[Path]] = defaultdict(list)
    for clip in masses_by_clip:
        groups[preview_group(clip)].append(clip)

    label_width = 220
    cell_width = 220
    cell_height = 210
    source_canvas_size = 168
    output_dir.mkdir(parents=True, exist_ok=True)
    for group, clips in sorted(groups.items()):
        clips.sort(key=lambda path: str(path.relative_to(ART_ROOT)))
        sheet = Image.new(
            "RGB",
            (label_width + cell_width * 4, cell_height * len(clips)),
            (229, 220, 196),
        )
        draw = ImageDraw.Draw(sheet)
        for row, clip in enumerate(clips):
            top = row * cell_height
            baseline = top + cell_height - 10
            draw.line(
                (label_width, baseline, sheet.width, baseline),
                fill=(160, 145, 118),
                width=1,
            )
            label = str(clip.relative_to(ART_ROOT)).replace("/", " / ")
            draw.text((8, top + 12), label, fill=(55, 42, 32))
            draw.text(
                (8, top + 34),
                f"shared correction {correction_by_clip[clip]:.3f}",
                fill=(95, 73, 52),
            )
            frames = sorted(
                path
                for path in clip.glob("*.webp")
                if path.stem.isdigit() and len(path.stem) == 2
            )
            corrected_size = round(source_canvas_size * correction_by_clip[clip])
            for column, frame_path in enumerate(frames):
                frame = Image.open(frame_path).convert("RGBA")
                frame = frame.resize(
                    (corrected_size, corrected_size), Image.Resampling.LANCZOS
                )
                cell_left = label_width + column * cell_width
                x = cell_left + (cell_width - frame.width) // 2
                y = baseline - frame.height
                sheet.paste(frame, (x, y), frame)
                draw.text((cell_left + 8, top + 8), frame_path.stem, fill=(95, 73, 52))
        sheet.save(output_dir / f"{group}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--preview-dir",
        type=Path,
        help="write corrected four-frame comparison sheets grouped by character",
    )
    parser.add_argument(
        "--frame-outliers",
        action="store_true",
        help="report frames whose body mass differs strongly from their clip median",
    )
    args = parser.parse_args()

    frames = sorted(
        path
        for path in ART_ROOT.rglob("*.webp")
        if path.stem.isdigit() and len(path.stem) == 2
    )
    if not frames:
        raise SystemExit("no numbered runtime WebP frames found")

    records: list[tuple[Path, str, float]] = [
        (path, character_key(path), ink_mass(path)) for path in frames
    ]
    invalid = [(path, mass) for path, _, mass in records if mass <= 0]
    if invalid:
        print("invalid frames (no measurable character ink):")
        for path, mass in invalid:
            print(f"  {path}: {mass:.1f}")
        raise SystemExit(1)

    idle_by_character: dict[str, list[float]] = defaultdict(list)
    for path, key, mass in records:
        if path.parent.name == "idle":
            idle_by_character[key].append(mass)

    target_by_character = {
        key: median(values) for key, values in idle_by_character.items()
    }
    masses_by_clip: dict[Path, list[float]] = defaultdict(list)
    character_by_clip: dict[Path, str] = {}
    for path, key, mass in records:
        masses_by_clip[path.parent].append(mass)
        character_by_clip[path.parent] = key

    correction_by_clip: dict[Path, float] = {}
    by_character: dict[str, list[float]] = defaultdict(list)
    for clip, masses in masses_by_clip.items():
        key = character_by_clip[clip]
        target = target_by_character[key]
        reference_mass = float(np.percentile(np.asarray(masses), 75))
        raw = math.sqrt(target / reference_mass)
        correction = min(HIGH_CORRECTION, max(LOW_CORRECTION, raw))
        correction_by_clip[clip] = correction
        by_character[key].append(correction)

    print(f"frames: {len(records)}")
    for key in sorted(by_character):
        values = by_character[key]
        print(
            f"{key:10s} idle-mass={target_by_character[key]:8.1f} "
            f"correction={min(values):.3f}..{max(values):.3f} "
            f"median={median(values):.3f}"
        )

    print("\nshared clip corrections (largest drift first):")
    ranked = sorted(
        correction_by_clip.items(),
        key=lambda item: abs(math.log(max(item[1], 0.001))),
        reverse=True,
    )
    for clip, correction in ranked:
        masses = masses_by_clip[clip]
        upper_mass = float(np.percentile(np.asarray(masses), 75))
        raw_correction = math.sqrt(
            target_by_character[character_by_clip[clip]] / upper_mass
        )
        max_raw_correction = math.sqrt(
            target_by_character[character_by_clip[clip]] / max(masses)
        )
        print(
            f"{str(clip.relative_to(ART_ROOT)):48s} "
            f"correction={correction:.3f} upper-raw={raw_correction:.3f} "
            f"max-raw={max_raw_correction:.3f} "
            f"ink-mass={median(masses):.1f}"
        )

    if args.frame_outliers:
        print("\nwithin-clip frame scale outliers (more than 20% correction):")
        for clip, masses in sorted(masses_by_clip.items(), key=lambda item: str(item[0])):
            clip_mass = median(masses)
            for index, mass in enumerate(masses, start=1):
                correction = math.sqrt(clip_mass / mass)
                if correction < 0.8 or correction > 1.2:
                    print(
                        f"{str(clip.relative_to(ART_ROOT)):48s} "
                        f"frame={index:02d} residual={correction:.3f}"
                    )

    if args.preview_dir:
        write_preview_sheets(masses_by_clip, correction_by_clip, args.preview_dir)
        print(f"\npreview sheets: {args.preview_dir}")


if __name__ == "__main__":
    main()
