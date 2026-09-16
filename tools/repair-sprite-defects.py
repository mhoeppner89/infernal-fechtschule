#!/usr/bin/env python3
"""Repair two audited source-sprite defects without changing unrelated art.

The repair is intentionally narrow:

* Remove the confirmed detached blade fragment in captain guardbreak frame 02.
  Frame 03 is measured but left byte-for-byte untouched because its visible
  blade is connected to the held hilt (the earlier broad audit was a false
  positive for that frame).
* Give all four Meyer longsword idle frames at least eight transparent pixels
  of source padding, using one bottom-centred scale and translation for the
  whole clip.

By default the script writes only evidence and candidate previews. Pass
``--apply`` to replace the four intended Meyer PNG/WebP pairs plus captain
frame 02's PNG/WebP pair. Runtime code, manifests, and all other art remain
untouched. Runtime WebPs retain their existing canvas size and visual treatment;
they receive the same geometry as their repaired source PNGs and are encoded
losslessly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


REPO_ROOT = Path(__file__).resolve().parents[1]
ART_ROOT = REPO_ROOT / "art-source/v1"  # v1 source tree, outside the shipped site/
MEYER_IDLE_DIR = ART_ROOT / "meyer/longsword/idle"
CAPTAIN_GUARDBREAK_DIR = ART_ROOT / "enemies/captain/guardbreak"
MEYER_FRAME_NAMES = ("01", "02", "03", "04")
SOURCE_PADDING = 8
CAPTAIN_COMPONENT_THRESHOLD = 192
CAPTAIN_FRAGMENT_DILATION_RADIUS = 2
MEYER_DISPLAY_HEIGHT = 188.0
MEYER_APPROVED_SCALE = 0.9375


@dataclass(frozen=True)
class Component:
    label: int
    area: int
    bbox: tuple[int, int, int, int]
    mask: np.ndarray


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rgba(path: Path) -> Image.Image:
    return Image.open(path).convert("RGBA")


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def alpha_margins(image: Image.Image) -> tuple[int, int, int, int] | None:
    bbox = alpha_bbox(image)
    if bbox is None:
        return None
    left, top, right, bottom = bbox
    return left, top, image.width - right, image.height - bottom


def visible_pixels(image: Image.Image) -> int:
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    return int(np.count_nonzero(alpha))


def bbox_for_mask(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)


def components(mask: np.ndarray) -> list[Component]:
    """Return 8-connected components for a boolean mask."""

    height, width = mask.shape
    visited = np.zeros(mask.shape, dtype=bool)
    output: list[Component] = []
    label = 0
    for start_y, start_x in zip(*np.where(mask & ~visited), strict=True):
        if visited[start_y, start_x]:
            continue
        label += 1
        queue: deque[tuple[int, int]] = deque([(int(start_y), int(start_x))])
        visited[start_y, start_x] = True
        points_y: list[int] = []
        points_x: list[int] = []
        while queue:
            y, x = queue.popleft()
            points_y.append(y)
            points_x.append(x)
            for next_y in range(max(0, y - 1), min(height, y + 2)):
                for next_x in range(max(0, x - 1), min(width, x + 2)):
                    if visited[next_y, next_x] or not mask[next_y, next_x]:
                        continue
                    visited[next_y, next_x] = True
                    queue.append((next_y, next_x))
        component_mask = np.zeros(mask.shape, dtype=bool)
        component_mask[points_y, points_x] = True
        output.append(
            Component(
                label=label,
                area=len(points_x),
                bbox=(
                    min(points_x),
                    min(points_y),
                    max(points_x) + 1,
                    max(points_y) + 1,
                ),
                mask=component_mask,
            )
        )
    return sorted(output, key=lambda item: item.area, reverse=True)


def significant_components(
    image: Image.Image, threshold: int = CAPTAIN_COMPONENT_THRESHOLD
) -> list[Component]:
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    return [item for item in components(alpha >= threshold) if item.area >= 20]


def component_record(component: Component) -> dict[str, object]:
    return {"area": component.area, "bbox": list(component.bbox)}


def repair_captain_frame_02(
    image: Image.Image,
) -> tuple[
    Image.Image,
    np.ndarray,
    Component | None,
    list[Component],
    list[Component],
]:
    """Remove only the confirmed lower-right fragment from guardbreak 02."""

    before_components = significant_components(image)
    candidates = [
        item
        for item in before_components[1:]
        if 100 <= item.area <= 2_000
        and item.bbox[0] >= round(image.width * 0.70)
        and item.bbox[1] >= round(image.height * 0.55)
        and item.bbox[3] <= round(image.height * 0.80)
    ]
    if not candidates and len(before_components) == 1:
        # Idempotent second run: the audited extra component is already gone.
        return (
            image.copy(),
            np.zeros((image.height, image.width), dtype=bool),
            None,
            before_components,
            before_components,
        )
    if len(candidates) != 1:
        details = [component_record(item) for item in before_components]
        raise RuntimeError(
            "Expected one confirmed captain frame-02 fragment at alpha "
            f">= {CAPTAIN_COMPONENT_THRESHOLD}; found {len(candidates)}. "
            f"Components: {details}"
        )
    fragment = candidates[0]
    dilated = Image.fromarray(fragment.mask.astype(np.uint8) * 255).filter(
        ImageFilter.MaxFilter(CAPTAIN_FRAGMENT_DILATION_RADIUS * 2 + 1)
    )
    alpha = np.asarray(image.getchannel("A"), dtype=np.uint8)
    removal_mask = (np.asarray(dilated, dtype=np.uint8) > 0) & (alpha > 0)
    # At the point nearest the cape, one high-alpha cape pixel lies inside the
    # fragment's two-pixel antialias envelope. The largest component is the
    # protected actor silhouette, so explicitly exclude its solid core.
    removal_mask &= ~before_components[0].mask

    repaired_pixels = np.asarray(image, dtype=np.uint8).copy()
    repaired_pixels[removal_mask] = 0
    repaired = Image.fromarray(repaired_pixels, mode="RGBA")
    after_components = significant_components(repaired)
    if len(before_components) < 2 or len(after_components) != 1:
        raise RuntimeError(
            "Captain fragment repair did not reduce the two significant "
            "high-alpha components to one."
        )
    return repaired, removal_mask, fragment, before_components, after_components


def meyer_shared_transform(
    frames: Sequence[Image.Image], padding: int = SOURCE_PADDING
) -> tuple[float, tuple[int, int], tuple[int, int, int, int]]:
    if not frames:
        raise ValueError("Meyer clip has no frames")
    size = frames[0].size
    if any(frame.size != size for frame in frames):
        raise RuntimeError("Meyer idle frames do not share one canvas size")
    boxes = [alpha_bbox(frame) for frame in frames]
    if any(box is None for box in boxes):
        raise RuntimeError("Meyer idle contains an empty-alpha frame")
    valid_boxes = [box for box in boxes if box is not None]
    union = (
        min(box[0] for box in valid_boxes),
        min(box[1] for box in valid_boxes),
        max(box[2] for box in valid_boxes),
        max(box[3] for box in valid_boxes),
    )
    width, height = size
    centre_x = width / 2.0
    left_span = max(0.0, centre_x - union[0])
    right_span = max(0.0, union[2] - centre_x)
    vertical_span = max(0.0, height - union[1])
    limits = [1.0]
    if left_span > 0:
        limits.append((centre_x - padding) / left_span)
    if right_span > 0:
        limits.append((centre_x - padding) / right_span)
    if vertical_span > 0:
        limits.append((height - 2 * padding) / vertical_span)
    scale = min(limits)
    scaled_size = (round(width * scale), round(height * scale))
    offset = ((width - scaled_size[0]) // 2, height - padding - scaled_size[1])
    return scale, offset, union


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize RGBA without importing colours from fully transparent pixels."""

    pixels = np.asarray(image, dtype=np.float32)
    alpha = pixels[:, :, 3:4] / 255.0
    premultiplied = np.concatenate((pixels[:, :, :3] * alpha, pixels[:, :, 3:4]), axis=2)
    premultiplied_image = Image.fromarray(
        np.clip(np.rint(premultiplied), 0, 255).astype(np.uint8), mode="RGBA"
    )
    resized = np.asarray(
        premultiplied_image.resize(size, Image.Resampling.LANCZOS), dtype=np.float32
    )
    resized_alpha = resized[:, :, 3:4]
    straight_rgb = np.divide(
        resized[:, :, :3] * 255.0,
        resized_alpha,
        out=np.zeros_like(resized[:, :, :3]),
        where=resized_alpha > 0,
    )
    output = np.concatenate((straight_rgb, resized_alpha), axis=2)
    return Image.fromarray(np.clip(np.rint(output), 0, 255).astype(np.uint8), mode="RGBA")


def transform_meyer_frame(
    image: Image.Image, scale: float, offset: tuple[int, int]
) -> Image.Image:
    width, height = image.size
    scaled_size = (round(width * scale), round(height * scale))
    resized = resize_premultiplied(image, scaled_size)
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output.alpha_composite(resized, offset)
    return output


def clear_alpha_border(image: Image.Image, padding: int) -> Image.Image:
    """Remove only resampling halo pixels that spill into guaranteed padding."""

    pixels = np.asarray(image, dtype=np.uint8).copy()
    pixels[:padding, :, :] = 0
    pixels[-padding:, :, :] = 0
    pixels[:, :padding, :] = 0
    pixels[:, -padding:, :] = 0
    return Image.fromarray(pixels, mode="RGBA")


def clip_to_bbox(
    image: Image.Image, bbox: tuple[int, int, int, int]
) -> Image.Image:
    """Discard resize ringing outside an already-approved runtime silhouette box."""

    left, top, right, bottom = bbox
    pixels = np.asarray(image, dtype=np.uint8).copy()
    pixels[:top, :, :] = 0
    pixels[bottom:, :, :] = 0
    pixels[:, :left, :] = 0
    pixels[:, right:, :] = 0
    return Image.fromarray(pixels, mode="RGBA")


def save_png(image: Image.Image, path: Path) -> None:
    image.save(path, format="PNG", optimize=True)


def save_lossless_webp(image: Image.Image, path: Path) -> None:
    image.save(
        path,
        format="WEBP",
        lossless=True,
        quality=100,
        method=6,
        exact=True,
    )


def checkerboard(size: tuple[int, int], square: int = 12) -> Image.Image:
    width, height = size
    y, x = np.indices((height, width))
    dark = ((x // square + y // square) % 2).astype(np.uint8)
    light_color = np.array([236, 229, 213], dtype=np.uint8)
    dark_color = np.array([204, 194, 175], dtype=np.uint8)
    rgb = np.where(dark[:, :, None] == 1, dark_color, light_color)
    return Image.fromarray(rgb, mode="RGB")


def framed_sprite(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    frame = checkerboard(size)
    preview = image.copy()
    preview.thumbnail(size, Image.Resampling.LANCZOS)
    x = (size[0] - preview.width) // 2
    y = (size[1] - preview.height) // 2
    frame.paste(preview, (x, y), preview)
    return frame


def draw_cell(
    sheet: Image.Image,
    draw: ImageDraw.ImageDraw,
    image: Image.Image,
    x: int,
    y: int,
    size: tuple[int, int],
    label: str,
) -> None:
    sheet.paste(framed_sprite(image, size), (x, y))
    draw.rectangle((x, y, x + size[0] - 1, y + size[1] - 1), outline=(105, 85, 61), width=1)
    draw.text((x + 6, y + 6), label, fill=(45, 32, 24), stroke_width=2, stroke_fill=(244, 237, 220))


def write_previews(
    output_dir: Path,
    captain_before: dict[str, Image.Image],
    captain_after: dict[str, Image.Image],
    meyer_before: dict[str, Image.Image],
    meyer_after: dict[str, Image.Image],
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    background = (224, 213, 191)
    sheet = Image.new("RGB", (1160, 1110), background)
    draw = ImageDraw.Draw(sheet)
    draw.text((24, 16), "Audited sprite repairs - before / after", fill=(45, 32, 24))
    draw.text((24, 43), "Captain guardbreak (03 is intentionally unchanged)", fill=(75, 55, 39))
    for column, name in enumerate(("02", "03")):
        x = 24 + column * 560
        draw_cell(sheet, draw, captain_before[name], x, 68, (260, 260), f"{name} before")
        draw_cell(sheet, draw, captain_after[name], x + 276, 68, (260, 260), f"{name} after")

    draw.text((24, 352), "Meyer longsword idle - one shared bottom-centred transform", fill=(75, 55, 39))
    for row, (label, frames) in enumerate((("before", meyer_before), ("after", meyer_after))):
        y = 380 + row * 350
        draw.text((24, y + 6), label, fill=(45, 32, 24))
        for column, name in enumerate(MEYER_FRAME_NAMES):
            draw_cell(sheet, draw, frames[name], 24 + column * 280, y + 28, (256, 256), f"{name} {label}")
            margins = alpha_margins(frames[name])
            draw.text((30 + column * 280, y + 292), f"margins L/T/R/B {margins}", fill=(75, 55, 39))
    sheet_path = output_dir / "sprite-repairs-before-after.png"
    sheet.save(sheet_path, optimize=True)

    crop_box = (450, 370, 590, 520)
    detail = Image.new("RGB", (900, 480), background)
    detail_draw = ImageDraw.Draw(detail)
    detail_draw.text((20, 16), "Captain guardbreak 02 - confirmed detached fragment", fill=(45, 32, 24))
    for index, (label, source) in enumerate(
        (("before", captain_before["02"]), ("after", captain_after["02"]))
    ):
        crop = source.crop(crop_box)
        enlarged = crop.resize((420, 420), Image.Resampling.NEAREST)
        cell = checkerboard((420, 420), square=18)
        cell.paste(enlarged, (0, 0), enlarged)
        x = 20 + index * 440
        detail.paste(cell, (x, 48))
        detail_draw.text((x + 8, 58), label, fill=(45, 32, 24), stroke_width=2, stroke_fill=(244, 237, 220))
    detail_path = output_dir / "captain-guardbreak-02-detail.png"
    detail.save(detail_path, optimize=True)
    return [sheet_path, detail_path]


def frame_metrics(image: Image.Image) -> dict[str, object]:
    return {
        "size": list(image.size),
        "alphaBBox": list(alpha_bbox(image) or ()),
        "margins": list(alpha_margins(image) or ()),
        "visiblePixels": visible_pixels(image),
    }


def region_exact(
    before: Image.Image, after: Image.Image, box: tuple[int, int, int, int]
) -> bool:
    return np.array_equal(np.asarray(before.crop(box)), np.asarray(after.crop(box)))


def validate_lossless_output(path: Path, expected: Image.Image) -> bool:
    """Confirm that the encoded file decodes to the intended RGBA bytes."""

    return np.array_equal(np.asarray(rgba(path)), np.asarray(expected))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="replace only the audited source PNGs and their runtime WebPs",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("/private/tmp/sprite-defect-repair"),
        help="directory for JSON evidence and grouped before/after previews",
    )
    args = parser.parse_args()

    captain_png_paths = {
        name: CAPTAIN_GUARDBREAK_DIR / f"{name}.png" for name in ("02", "03")
    }
    captain_webp_paths = {
        name: CAPTAIN_GUARDBREAK_DIR / f"{name}.webp" for name in ("02", "03")
    }
    captain_before = {name: rgba(path) for name, path in captain_png_paths.items()}
    captain_runtime_before = {
        name: rgba(path) for name, path in captain_webp_paths.items()
    }
    captain_before_hashes = {
        f"{name}.png": sha256(captain_png_paths[name]) for name in ("02", "03")
    } | {
        f"{name}.webp": sha256(captain_webp_paths[name]) for name in ("02", "03")
    }

    repaired_02, removal_mask, fragment, before_components, after_components = (
        repair_captain_frame_02(captain_before["02"])
    )
    captain_after = {
        "02": repaired_02,
        # The attached left blade in 03 reaches its held hilt. Preserve all bytes.
        "03": captain_before["03"].copy(),
    }
    runtime_before_components = significant_components(captain_runtime_before["02"])
    runtime_size = captain_runtime_before["02"].size
    repaired_runtime_02 = clip_to_bbox(
        resize_premultiplied(repaired_02, runtime_size),
        alpha_bbox(captain_runtime_before["02"]),
    )
    runtime_after_components = significant_components(repaired_runtime_02)
    captain_runtime_after = {
        "02": repaired_runtime_02,
        "03": captain_runtime_before["03"].copy(),
    }

    meyer_png_paths = {
        name: MEYER_IDLE_DIR / f"{name}.png" for name in MEYER_FRAME_NAMES
    }
    meyer_webp_paths = {
        name: MEYER_IDLE_DIR / f"{name}.webp" for name in MEYER_FRAME_NAMES
    }
    meyer_before = {name: rgba(path) for name, path in meyer_png_paths.items()}
    meyer_runtime_before = {
        name: rgba(path) for name, path in meyer_webp_paths.items()
    }
    scale, offset, union = meyer_shared_transform(list(meyer_before.values()))
    already_padded = all(
        min(alpha_margins(frame) or (0,)) >= SOURCE_PADDING
        for frame in meyer_before.values()
    )
    if already_padded:
        scale = 1.0
        offset = (0, 0)
        meyer_after = {name: frame.copy() for name, frame in meyer_before.items()}
        runtime_padding = min(
            min(alpha_margins(frame) or (0,))
            for frame in meyer_runtime_before.values()
        )
        runtime_offset = (0, 0)
    else:
        meyer_after = {
            name: transform_meyer_frame(frame, scale, offset)
            for name, frame in meyer_before.items()
        }
        runtime_sizes = {frame.size for frame in meyer_runtime_before.values()}
        if len(runtime_sizes) != 1:
            raise RuntimeError("Meyer runtime idle WebPs do not share one canvas size")
        runtime_width, runtime_height = next(iter(runtime_sizes))
        runtime_padding = round(SOURCE_PADDING * runtime_height / 256)
        runtime_scaled_size = (
            round(runtime_width * scale),
            round(runtime_height * scale),
        )
        runtime_offset = (
            (runtime_width - runtime_scaled_size[0]) // 2,
            runtime_height - runtime_padding - runtime_scaled_size[1],
        )
    # Runtime files are derived from the repaired PNG sources at their existing
    # canvas size. This avoids carrying any removed outline pixels forward and
    # keeps the WebP format lossless without changing runtime dimensions.
    meyer_runtime_after = {
        name: clear_alpha_border(
            resize_premultiplied(
                meyer_after[name], meyer_runtime_before[name].size
            ),
            runtime_padding,
        )
        for name in MEYER_FRAME_NAMES
    }

    for name, frame in meyer_after.items():
        margins = alpha_margins(frame)
        if margins is None or min(margins) < SOURCE_PADDING:
            raise RuntimeError(
                f"Meyer {name} failed {SOURCE_PADDING}px alpha padding: {margins}"
            )
        if frame.size != meyer_before[name].size or visible_pixels(frame) <= 0:
            raise RuntimeError(f"Meyer {name} failed size/alpha validation")

    for name, frame in meyer_runtime_after.items():
        margins = alpha_margins(frame)
        if margins is None or min(margins) < runtime_padding:
            raise RuntimeError(
                f"Meyer runtime {name} failed {runtime_padding}px alpha padding: "
                f"{margins}"
            )
        if frame.size != meyer_runtime_before[name].size or visible_pixels(frame) <= 0:
            raise RuntimeError(f"Meyer runtime {name} failed size/alpha validation")

    if repaired_02.size != captain_before["02"].size or visible_pixels(repaired_02) <= 0:
        raise RuntimeError("Captain 02 failed size/alpha validation")
    removal_bbox = bbox_for_mask(removal_mask)
    if fragment is not None and removal_bbox is None:
        raise RuntimeError("Captain 02 repair removed no visible pixels")
    if not region_exact(captain_before["02"], repaired_02, (70, 0, 300, 300)):
        raise RuntimeError("Captain 02 held weapon or plume changed")
    if alpha_bbox(captain_before["02"])[3] != alpha_bbox(repaired_02)[3]:
        raise RuntimeError("Captain 02 foot anchor changed")
    if not np.array_equal(
        np.asarray(captain_before["03"]), np.asarray(captain_after["03"])
    ):
        raise RuntimeError("Captain 03 must remain pixel-exact")
    if alpha_bbox(captain_runtime_before["02"])[3] != alpha_bbox(repaired_runtime_02)[3]:
        raise RuntimeError("Captain runtime 02 foot anchor changed")
    if len(runtime_after_components) != 1:
        raise RuntimeError("Captain runtime 02 still has a detached high-alpha component")
    if not np.array_equal(
        np.asarray(captain_runtime_before["03"]),
        np.asarray(captain_runtime_after["03"]),
    ):
        raise RuntimeError("Captain runtime 03 must remain pixel-exact")

    preview_paths = write_previews(
        args.output_dir,
        captain_before,
        captain_after,
        meyer_before,
        meyer_after,
    )

    if args.apply:
        save_png(captain_after["02"], captain_png_paths["02"])
        save_lossless_webp(captain_runtime_after["02"], captain_webp_paths["02"])
        for name in MEYER_FRAME_NAMES:
            save_png(meyer_after[name], meyer_png_paths[name])
            save_lossless_webp(meyer_runtime_after[name], meyer_webp_paths[name])

    reported_scale = scale if not already_padded else MEYER_APPROVED_SCALE
    reported_offset = offset if not already_padded else (SOURCE_PADDING, SOURCE_PADDING)
    reported_runtime_offset = (
        runtime_offset
        if not already_padded
        else (
            round(SOURCE_PADDING * next(iter(meyer_runtime_before.values())).width / 256),
            round(SOURCE_PADDING * next(iter(meyer_runtime_before.values())).height / 256),
        )
    )
    source_foot_offset = SOURCE_PADDING
    unchanged_height_foot_offset = source_foot_offset / 256.0 * MEYER_DISPLAY_HEIGHT
    restored_body_height = MEYER_DISPLAY_HEIGHT / max(reported_scale, 1e-9)
    restored_scale_foot_offset = source_foot_offset / 256.0 * restored_body_height

    frame_03_components = significant_components(captain_before["03"])
    report: dict[str, object] = {
        "mode": "apply" if args.apply else "preview-only",
        "captainGuardbreak": {
            "frame02": {
                "componentThreshold": CAPTAIN_COMPONENT_THRESHOLD,
                "beforeSignificantComponents": [
                    component_record(item) for item in before_components
                ],
                "repairStatus": "REMOVED" if fragment is not None else "ALREADY_REPAIRED",
                "confirmedFragment": (
                    component_record(fragment) if fragment is not None else None
                ),
                "dilationRadius": CAPTAIN_FRAGMENT_DILATION_RADIUS,
                "removedVisiblePixels": int(np.count_nonzero(removal_mask)),
                "removedAlphaSum": int(
                    np.asarray(captain_before["02"].getchannel("A"), dtype=np.uint8)[
                        removal_mask
                    ].sum()
                ),
                "removedBBox": list(removal_bbox or ()),
                "afterSignificantComponents": [
                    component_record(item) for item in after_components
                ],
                "before": frame_metrics(captain_before["02"]),
                "after": frame_metrics(captain_after["02"]),
                "heldWeaponAndPlumeRegionExact": region_exact(
                    captain_before["02"], captain_after["02"], (70, 0, 300, 300)
                ),
                "footAnchorBottomExact": alpha_bbox(captain_before["02"])[3]
                == alpha_bbox(captain_after["02"])[3],
                "runtimeWebp": {
                    "beforeSignificantComponents": [
                        component_record(item) for item in runtime_before_components
                    ],
                    "derivedFromRepairedPng": True,
                    "visiblePixelDelta": visible_pixels(repaired_runtime_02)
                    - visible_pixels(captain_runtime_before["02"]),
                    "afterSignificantComponents": [
                        component_record(item) for item in runtime_after_components
                    ],
                    "before": frame_metrics(captain_runtime_before["02"]),
                    "after": frame_metrics(captain_runtime_after["02"]),
                    "heldWeaponAndPlumePreservedBySourceExactness": True,
                    "footAnchorBottomExact": alpha_bbox(
                        captain_runtime_before["02"]
                    )[3]
                    == alpha_bbox(captain_runtime_after["02"])[3],
                },
            },
            "frame03": {
                "status": "AUDITED_FALSE_POSITIVE_UNCHANGED",
                "reason": "The visible left blade is connected to its held hilt.",
                "significantComponents": [
                    component_record(item) for item in frame_03_components
                ],
                "rgbaExact": bool(
                    np.array_equal(
                        np.asarray(captain_before["03"]),
                        np.asarray(captain_after["03"]),
                    )
                ),
                "runtimeWebpRgbaExact": bool(
                    np.array_equal(
                        np.asarray(captain_runtime_before["03"]),
                        np.asarray(captain_runtime_after["03"]),
                    )
                ),
                "pngAndWebpHashesBefore": {
                    "png": captain_before_hashes["03.png"],
                    "webp": captain_before_hashes["03.webp"],
                },
            },
        },
        "meyerLongswordIdle": {
            "alreadyPaddedAtStart": already_padded,
            "sharedTransform": {
                "bodyScaleFactor": reported_scale,
                "bodyScalePercent": reported_scale * 100.0,
                "scaledCanvas": [
                    round(256 * reported_scale),
                    round(256 * reported_scale),
                ],
                "pasteOffset": list(reported_offset),
                "runtimeWebpScaledCanvas": [
                    round(
                        next(iter(meyer_runtime_before.values())).width
                        * reported_scale
                    ),
                    round(
                        next(iter(meyer_runtime_before.values())).height
                        * reported_scale
                    ),
                ],
                "runtimeWebpPasteOffset": list(reported_runtime_offset),
                "runtimeWebpPadding": runtime_padding,
                "sourceUnionBBox": list(union),
                "sourceFootOffsetPixelsUp": source_foot_offset,
                "footOffsetAtUnchanged188LogicalHeight": unchanged_height_foot_offset,
                "bodyScaleCompensation": 1.0 / max(reported_scale, 1e-9),
                "footOffsetAfterBodyScaleCompensation": restored_scale_foot_offset,
                "recommendedPositiveDisplayOffsetY": restored_scale_foot_offset,
                "renderedFootTargetToleranceLogicalPixels": 3,
            },
            "frames": {
                name: {
                    "before": frame_metrics(meyer_before[name]),
                    "after": frame_metrics(meyer_after[name]),
                    "runtimeWebpBefore": frame_metrics(meyer_runtime_before[name]),
                    "runtimeWebpAfter": frame_metrics(meyer_runtime_after[name]),
                }
                for name in MEYER_FRAME_NAMES
            },
        },
        "previews": [str(path) for path in preview_paths],
    }

    if args.apply:
        report["captainGuardbreak"]["frame02"]["pngLosslessOutputExact"] = (  # type: ignore[index]
            validate_lossless_output(captain_png_paths["02"], captain_after["02"])
        )
        report["captainGuardbreak"]["frame02"]["webpLosslessOutputExact"] = (  # type: ignore[index]
            validate_lossless_output(
                captain_webp_paths["02"], captain_runtime_after["02"]
            )
        )
        report["captainGuardbreak"]["frame03"]["pngHashUnchanged"] = (  # type: ignore[index]
            sha256(captain_png_paths["03"]) == captain_before_hashes["03.png"]
        )
        report["captainGuardbreak"]["frame03"]["webpHashUnchanged"] = (  # type: ignore[index]
            sha256(captain_webp_paths["03"]) == captain_before_hashes["03.webp"]
        )
        report["meyerLongswordIdle"]["pngLosslessOutputExact"] = {  # type: ignore[index]
            name: validate_lossless_output(meyer_png_paths[name], meyer_after[name])
            for name in MEYER_FRAME_NAMES
        }
        report["meyerLongswordIdle"]["webpLosslessOutputExact"] = {  # type: ignore[index]
            name: validate_lossless_output(
                meyer_webp_paths[name], meyer_runtime_after[name]
            )
            for name in MEYER_FRAME_NAMES
        }

    args.output_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.output_dir / "repair-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"\nReport: {report_path}")


if __name__ == "__main__":
    main()
