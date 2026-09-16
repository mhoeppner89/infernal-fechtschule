#!/usr/bin/env python3
"""Create deterministic, simplified variants of runtime sprites and backgrounds.

The source art is never edited. Numbered sprite WebPs receive one fixed palette
per actor, so colors cannot drift between frames or clips. Sprite alpha is copied
byte-for-byte, which also preserves every silhouette and bottom anchor. Scenery
uses a larger palette and less smoothing so it recedes without looking posterized.

Example:
    python3 tools/stylize-runtime-art.py \
      --output-root /private/tmp/fechtschule-stylized \
      --preview-dir /private/tmp/fechtschule-stylized/previews
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


DEFAULT_SOURCE_ROOT = Path("art-source/v1")  # v1 source tree, outside the shipped site/
SPRITE_SIZE = (384, 384)
BACKGROUND_DIR = "backgrounds"
RUNTIME_FRAME_DIGITS = 2
PALETTE_BIN_BITS = 5
PALETTE_BIN_COUNT = 1 << (PALETTE_BIN_BITS * 3)
WEBP_SAVE_OPTIONS = {
    "format": "WEBP",
    "lossless": True,
    "quality": 100,
    "method": 4,
    "exact": True,
}


def runtime_sprite_paths(source_root: Path) -> list[Path]:
    return sorted(
        path
        for path in source_root.rglob("*.webp")
        if path.stem.isdigit()
        and len(path.stem) == RUNTIME_FRAME_DIGITS
        and BACKGROUND_DIR not in path.relative_to(source_root).parts
    )


def background_paths(source_root: Path) -> list[Path]:
    background_root = source_root / BACKGROUND_DIR
    return sorted(background_root.glob("*.webp"))


def actor_key(path: Path, source_root: Path) -> str:
    parts = path.relative_to(source_root).parts
    if parts[0] == "meyer":
        # Both weapon sets intentionally share one palette.
        return "meyer"
    if parts[0] == "enemies" and len(parts) >= 3:
        return parts[1]
    raise ValueError(f"cannot derive actor from runtime frame: {path}")


def srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    """Convert sRGB values in 0..1 to OKLab."""
    linear = np.where(
        rgb <= 0.04045,
        rgb / 12.92,
        ((rgb + 0.055) / 1.055) ** 2.4,
    )
    red, green, blue = np.moveaxis(linear, -1, 0)
    light = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
    medium = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
    short = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue
    light = np.cbrt(np.maximum(light, 0.0))
    medium = np.cbrt(np.maximum(medium, 0.0))
    short = np.cbrt(np.maximum(short, 0.0))
    return np.stack(
        (
            0.2104542553 * light + 0.7936177850 * medium - 0.0040720468 * short,
            1.9779984951 * light - 2.4285922050 * medium + 0.4505937099 * short,
            0.0259040371 * light + 0.7827717662 * medium - 0.8086757660 * short,
        ),
        axis=-1,
    )


def oklab_to_srgb(lab: np.ndarray) -> np.ndarray:
    """Convert OKLab values to clipped sRGB values in 0..1."""
    lightness, axis_a, axis_b = np.moveaxis(lab, -1, 0)
    light = lightness + 0.3963377774 * axis_a + 0.2158037573 * axis_b
    medium = lightness - 0.1055613458 * axis_a - 0.0638541728 * axis_b
    short = lightness - 0.0894841775 * axis_a - 1.2914855480 * axis_b
    light = light**3
    medium = medium**3
    short = short**3
    red = 4.0767416621 * light - 3.3077115913 * medium + 0.2309699292 * short
    green = -1.2684380046 * light + 2.6097574011 * medium - 0.3413193965 * short
    blue = -0.0041960863 * light - 0.7034186147 * medium + 1.7076147010 * short
    linear = np.stack((red, green, blue), axis=-1)
    linear = np.clip(linear, 0.0, 1.0)
    return np.where(
        linear <= 0.0031308,
        linear * 12.92,
        1.055 * np.power(linear, 1.0 / 2.4) - 0.055,
    )


def color_histogram(
    paths: Iterable[Path], alpha_threshold: int, include_alpha: bool
) -> np.ndarray:
    """Build a compact, alpha-weighted 5-bit RGB histogram."""
    histogram = np.zeros(PALETTE_BIN_COUNT, dtype=np.float64)
    shift = 8 - PALETTE_BIN_BITS
    for path in paths:
        rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)
        rgb = rgba[:, :, :3].reshape(-1, 3)
        alpha = rgba[:, :, 3].reshape(-1)
        if include_alpha:
            visible = alpha >= alpha_threshold
            rgb = rgb[visible]
            weights = alpha[visible].astype(np.float64) / 255.0
        else:
            weights = np.ones(len(rgb), dtype=np.float64)
        if len(rgb) == 0:
            continue
        quantized = rgb >> shift
        indices = (
            (quantized[:, 0].astype(np.int32) << (PALETTE_BIN_BITS * 2))
            | (quantized[:, 1].astype(np.int32) << PALETTE_BIN_BITS)
            | quantized[:, 2].astype(np.int32)
        )
        histogram += np.bincount(
            indices, weights=weights, minlength=PALETTE_BIN_COUNT
        )
    return histogram


def histogram_points(histogram: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    indices = np.flatnonzero(histogram)
    if len(indices) == 0:
        raise ValueError("cannot build a palette from an empty histogram")
    mask = (1 << PALETTE_BIN_BITS) - 1
    shift = 8 - PALETTE_BIN_BITS
    half_step = 1 << max(shift - 1, 0)
    red = (indices >> (PALETTE_BIN_BITS * 2)) & mask
    green = (indices >> PALETTE_BIN_BITS) & mask
    blue = indices & mask
    rgb = np.stack((red, green, blue), axis=1).astype(np.float64)
    rgb = (rgb * (1 << shift) + half_step) / 255.0
    return rgb, histogram[indices]


def actor_palette_anchors(
    points: np.ndarray, weights: np.ndarray
) -> list[int]:
    """Choose stable outline, accent, and neutral-steel bins to lock in place."""
    lightness = points[:, 0]
    chroma = np.linalg.norm(points[:, 1:], axis=1)
    significant = weights >= max(2.0, float(weights.max()) * 0.001)
    anchors: list[int] = []

    def add_best(mask: np.ndarray, score: np.ndarray) -> None:
        candidates = np.flatnonzero(mask)
        if len(candidates) == 0:
            return
        best = int(candidates[np.argmax(score[candidates])])
        if best not in anchors:
            anchors.append(best)

    # Dark contour ink.
    add_best(significant & (lightness < 0.34), -lightness)
    # Mid and high neutral values keep swords, spear tips, armor, and chains steel.
    add_best(
        significant & (chroma < 0.045) & (lightness >= 0.42) & (lightness <= 0.72),
        np.sqrt(weights) * (1.0 - np.abs(lightness - 0.58)),
    )
    add_best(
        significant & (chroma < 0.055) & (lightness > 0.72),
        np.sqrt(weights) * lightness,
    )

    accent_score = (
        chroma
        * np.power(weights / max(float(weights.max()), 1.0), 0.18)
        * (0.7 + 0.3 * lightness)
    )
    accent_mask = significant & (chroma > 0.075)
    add_best(accent_mask, accent_score)
    if anchors:
        first_accent = anchors[-1]
        accent_distance = np.linalg.norm(points - points[first_accent], axis=1)
        add_best(accent_mask, accent_score * accent_distance)
    return anchors


def deterministic_palette(
    histogram: np.ndarray, color_count: int, preserve_actor_accents: bool = False
) -> np.ndarray:
    """Return a deterministic perceptual palette as uint8 RGB values."""
    rgb, weights = histogram_points(histogram)
    points = srgb_to_oklab(rgb)
    color_count = min(color_count, len(points))
    if color_count <= 0:
        raise ValueError("palette color count must be positive")

    # Actor anchors explicitly reserve contour ink, two neutral steel values, and
    # two separated high-chroma accents. Farthest-point seeding fills the rest.
    chosen = (
        actor_palette_anchors(points, weights) if preserve_actor_accents else []
    )
    chosen = chosen[:color_count]
    locked_count = len(chosen)
    if not chosen:
        chosen = [int(np.argmax(weights))]
    minimum_distance = np.min(
        np.sum(
            (points[:, np.newaxis, :] - points[np.asarray(chosen)][np.newaxis, :, :])
            ** 2,
            axis=2,
        ),
        axis=1,
    )
    scaled_weights = np.sqrt(weights / max(float(weights.max()), 1.0))
    while len(chosen) < color_count:
        score = minimum_distance * (0.12 + 0.88 * scaled_weights)
        score[np.asarray(chosen, dtype=np.int32)] = -1.0
        next_index = int(np.argmax(score))
        chosen.append(next_index)
        distance = np.sum((points - points[next_index]) ** 2, axis=1)
        minimum_distance = np.minimum(minimum_distance, distance)

    centroids = points[np.asarray(chosen)].copy()
    labels = np.full(len(points), -1, dtype=np.int32)
    for _ in range(32):
        distances = np.sum(
            (points[:, np.newaxis, :] - centroids[np.newaxis, :, :]) ** 2,
            axis=2,
        )
        new_labels = np.argmin(distances, axis=1)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        next_centroids = centroids.copy()
        nearest_distance = distances[np.arange(len(points)), labels]
        for index in range(locked_count, color_count):
            members = labels == index
            if np.any(members):
                next_centroids[index] = np.average(
                    points[members], axis=0, weights=weights[members]
                )
            else:
                replacement = int(
                    np.argmax(nearest_distance * (0.12 + 0.88 * scaled_weights))
                )
                next_centroids[index] = points[replacement]
        if np.max(np.abs(next_centroids - centroids)) < 1e-7:
            centroids = next_centroids
            break
        centroids = next_centroids

    palette = np.rint(oklab_to_srgb(centroids) * 255.0).astype(np.uint8)
    # A stable luminance order makes reports and swatch sheets easy to compare.
    palette_lab = srgb_to_oklab(palette.astype(np.float64) / 255.0)
    order = np.lexsort((palette[:, 2], palette[:, 1], palette[:, 0], palette_lab[:, 0]))
    return palette[order]


def alpha_weighted_smooth(rgba: np.ndarray, radius: float) -> np.ndarray:
    """Smooth sprite color without moving or softening its alpha silhouette."""
    rgb = rgba[:, :, :3].astype(np.float32)
    if radius <= 0:
        return rgb
    alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    blurred_alpha = np.asarray(
        Image.fromarray(np.rint(alpha * 255.0).astype(np.uint8), mode="L").filter(
            ImageFilter.GaussianBlur(radius)
        ),
        dtype=np.float32,
    )
    smoothed = np.zeros_like(rgb)
    for channel in range(3):
        premultiplied = np.rint(rgb[:, :, channel] * alpha).astype(np.uint8)
        blurred = np.asarray(
            Image.fromarray(premultiplied, mode="L").filter(
                ImageFilter.GaussianBlur(radius)
            ),
            dtype=np.float32,
        )
        np.divide(
            blurred * 255.0,
            np.maximum(blurred_alpha, 1.0),
            out=smoothed[:, :, channel],
            where=blurred_alpha > 0,
        )
    invisible = rgba[:, :, 3] == 0
    smoothed[invisible] = 0.0
    return np.clip(smoothed, 0.0, 255.0)


def smooth_rgb(rgb: np.ndarray, radius: float) -> np.ndarray:
    if radius <= 0:
        return rgb.astype(np.float32)
    image = Image.fromarray(rgb.astype(np.uint8), mode="RGB")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32)


def nearest_palette_indices(rgb: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """Find fixed-palette indices without dithering."""
    shape = rgb.shape
    flat = np.clip(rgb.reshape(-1, 3), 0.0, 255.0).astype(np.float64) / 255.0
    palette_lab = srgb_to_oklab(palette.astype(np.float64) / 255.0)
    indices = np.empty(len(flat), dtype=np.uint8)
    chunk_size = 65_536
    for start in range(0, len(flat), chunk_size):
        stop = min(start + chunk_size, len(flat))
        lab = srgb_to_oklab(flat[start:stop])
        distances = np.sum(
            (lab[:, np.newaxis, :] - palette_lab[np.newaxis, :, :]) ** 2,
            axis=2,
        )
        indices[start:stop] = np.argmin(distances, axis=1).astype(np.uint8)
    return indices.reshape(shape[:2])


def map_to_palette(rgb: np.ndarray, palette: np.ndarray) -> np.ndarray:
    return palette[nearest_palette_indices(rgb, palette)]


def stylize_sprite(
    path: Path,
    palette: np.ndarray,
    smoothing: float,
    contour_pixels: int,
    interior_cleanup: int,
) -> Image.Image:
    rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)
    smoothed = alpha_weighted_smooth(rgba, smoothing)
    indices = nearest_palette_indices(smoothed, palette)
    alpha = rgba[:, :, 3]

    # Remove isolated color flecks only where a solid 5x5 alpha neighborhood
    # proves this is body fill. Thin weapons, chains, hair, and motion arcs are
    # therefore never swallowed by the cleanup.
    if interior_cleanup >= 3:
        solid = Image.fromarray(np.where(alpha >= 96, 255, 0).astype(np.uint8), mode="L")
        interior = np.asarray(solid.filter(ImageFilter.MinFilter(5))) == 255
        filtered = np.asarray(
            Image.fromarray(indices, mode="L").filter(
                ImageFilter.ModeFilter(interior_cleanup)
            ),
            dtype=np.uint8,
        )
        indices[interior] = filtered[interior]

    # One actor-wide contour rule replaces inconsistent generated edge colors.
    # Alpha stays unchanged, so this sharpens readability without growing forms.
    if contour_pixels > 0:
        visible = Image.fromarray(
            np.where(alpha >= 24, 255, 0).astype(np.uint8), mode="L"
        )
        eroded = np.asarray(
            visible.filter(ImageFilter.MinFilter(contour_pixels * 2 + 1))
        ) == 255
        boundary = (alpha >= 24) & ~eroded
        support = np.asarray(visible.filter(ImageFilter.BoxBlur(1)), dtype=np.uint8)
        palette_lab = srgb_to_oklab(palette.astype(np.float64) / 255.0)
        lightness = palette_lab[:, 0]
        chroma = np.linalg.norm(palette_lab[:, 1:], axis=1)
        thin_neutral = (
            (lightness[indices] > 0.52)
            & (chroma[indices] < 0.07)
            & (support < 210)
        )
        boundary &= (support >= 104) & ~thin_neutral
        indices[boundary] = int(np.argmin(lightness))

    result = np.empty_like(rgba)
    result[:, :, :3] = palette[indices]
    result[:, :, 3] = alpha
    result[alpha == 0, :3] = 0
    return Image.fromarray(result, mode="RGBA")


def quiet_background_rgb(rgb: np.ndarray, saturation: float) -> np.ndarray:
    working = rgb.astype(np.float32)
    luminance = (
        working[:, :, 0] * 0.2126
        + working[:, :, 1] * 0.7152
        + working[:, :, 2] * 0.0722
    )[:, :, np.newaxis]
    return np.clip(luminance + saturation * (working - luminance), 0.0, 255.0)


def background_histogram(path: Path, saturation: float) -> np.ndarray:
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)
    adjusted = np.rint(quiet_background_rgb(rgb, saturation)).astype(np.uint8)
    shift = 8 - PALETTE_BIN_BITS
    quantized = adjusted.reshape(-1, 3) >> shift
    indices = (
        (quantized[:, 0].astype(np.int32) << (PALETTE_BIN_BITS * 2))
        | (quantized[:, 1].astype(np.int32) << PALETTE_BIN_BITS)
        | quantized[:, 2].astype(np.int32)
    )
    return np.bincount(indices, minlength=PALETTE_BIN_COUNT).astype(np.float64)


def stylize_background(
    path: Path, palette: np.ndarray, smoothing: float, saturation: float
) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.uint8)
    quiet = quiet_background_rgb(rgb, saturation)
    return Image.fromarray(
        map_to_palette(smooth_rgb(quiet, smoothing), palette), mode="RGB"
    )


def image_alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.convert("RGBA").getchannel("A").getbbox()


def visible_colors(image: Image.Image) -> set[tuple[int, int, int]]:
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
    pixels = rgba[:, :, :3][rgba[:, :, 3] > 0]
    return {tuple(int(channel) for channel in color) for color in np.unique(pixels, axis=0)}


def validate_sprites(
    sprite_paths: Sequence[Path],
    source_root: Path,
    output_root: Path,
    palettes: dict[str, np.ndarray],
) -> dict[str, object]:
    alpha_mismatches: list[str] = []
    size_mismatches: list[str] = []
    bbox_mismatches: list[str] = []
    palette_mismatches: list[str] = []
    max_colors: dict[str, int] = defaultdict(int)
    for source_path in sprite_paths:
        relative = source_path.relative_to(source_root)
        output_path = output_root / relative
        source = Image.open(source_path).convert("RGBA")
        output = Image.open(output_path).convert("RGBA")
        if source.size != output.size:
            size_mismatches.append(str(relative))
        source_alpha = np.asarray(source.getchannel("A"), dtype=np.uint8)
        output_alpha = np.asarray(output.getchannel("A"), dtype=np.uint8)
        if not np.array_equal(source_alpha, output_alpha):
            alpha_mismatches.append(str(relative))
        if image_alpha_bbox(source) != image_alpha_bbox(output):
            bbox_mismatches.append(str(relative))
        key = actor_key(source_path, source_root)
        colors = visible_colors(output)
        max_colors[key] = max(max_colors[key], len(colors))
        allowed = {tuple(int(channel) for channel in color) for color in palettes[key]}
        if not colors.issubset(allowed):
            palette_mismatches.append(str(relative))
    return {
        "alphaExact": not alpha_mismatches,
        "alphaMismatches": alpha_mismatches,
        "sizesExact": not size_mismatches,
        "sizeMismatches": size_mismatches,
        "alphaBoundsExact": not bbox_mismatches,
        "alphaBoundsMismatches": bbox_mismatches,
        "bottomAnchorsExact": not bbox_mismatches,
        "sharedPaletteExact": not palette_mismatches,
        "sharedPaletteMismatches": palette_mismatches,
        "maximumVisibleColorsPerFrame": dict(sorted(max_colors.items())),
    }


def validate_backgrounds(
    paths: Sequence[Path], source_root: Path, output_root: Path
) -> dict[str, object]:
    size_mismatches: list[str] = []
    for source_path in paths:
        relative = source_path.relative_to(source_root)
        output_path = output_root / relative
        if Image.open(source_path).size != Image.open(output_path).size:
            size_mismatches.append(str(relative))
    return {
        "sizesExact": not size_mismatches,
        "sizeMismatches": size_mismatches,
    }


def alpha_margins(path: Path) -> list[int] | None:
    image = Image.open(path).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        return None
    left, top, right, bottom = bbox
    return [left, top, image.width - right, image.height - bottom]


def high_alpha_components(path: Path, threshold: int = 128) -> list[dict[str, object]]:
    """Measure 8-connected high-alpha components without an extra dependency."""
    alpha = np.asarray(Image.open(path).convert("RGBA").getchannel("A"), dtype=np.uint8)
    mask = alpha >= threshold
    visited = np.zeros(mask.shape, dtype=bool)
    height, width = mask.shape
    components: list[dict[str, object]] = []
    for start_y, start_x in zip(*np.nonzero(mask)):
        if visited[start_y, start_x]:
            continue
        stack = [(int(start_x), int(start_y))]
        visited[start_y, start_x] = True
        area = 0
        left = right = int(start_x)
        top = bottom = int(start_y)
        while stack:
            x, y = stack.pop()
            area += 1
            left = min(left, x)
            right = max(right, x)
            top = min(top, y)
            bottom = max(bottom, y)
            for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                    if mask[neighbor_y, neighbor_x] and not visited[neighbor_y, neighbor_x]:
                        visited[neighbor_y, neighbor_x] = True
                        stack.append((neighbor_x, neighbor_y))
        components.append(
            {
                "area": area,
                "bbox": [left, top, right + 1, bottom + 1],
            }
        )
    components.sort(key=lambda component: int(component["area"]), reverse=True)
    return components


def fragile_detail_audit(
    sprite_paths: Sequence[Path], source_root: Path, output_root: Path
) -> dict[str, object]:
    captain_dir = source_root / "enemies" / "captain" / "guardbreak"
    captain_records = []
    for frame_name in ("02.webp", "03.webp"):
        source = captain_dir / frame_name
        output = output_root / source.relative_to(source_root)
        if not source.exists() or not output.exists():
            captain_records.append(
                {
                    "frame": str(source.relative_to(source_root)),
                    "present": False,
                    "passed": False,
                }
            )
            continue
        source_alpha = np.asarray(
            Image.open(source).convert("RGBA").getchannel("A"), dtype=np.uint8
        )
        output_alpha = np.asarray(
            Image.open(output).convert("RGBA").getchannel("A"), dtype=np.uint8
        )
        components = high_alpha_components(source, threshold=128)
        alpha_exact = bool(np.array_equal(source_alpha, output_alpha))
        captain_records.append(
            {
                "frame": str(source.relative_to(source_root)),
                "present": True,
                "sourceSha256": file_sha256(source),
                "highAlphaThreshold": 128,
                "highAlphaComponentCount": len(components),
                "highAlphaComponents": components,
                "singleConnectedHighAlphaFigure": len(components) == 1,
                "alphaBytesExactAfterStylization": alpha_exact,
                "passed": len(components) == 1 and alpha_exact,
            }
        )
    captain_passed = (
        len(captain_records) == 2
        and all(bool(record["passed"]) for record in captain_records)
    )

    meyer_idle = sorted(
        path
        for path in sprite_paths
        if path.parent == source_root / "meyer" / "longsword" / "idle"
    )
    idle_records = []
    for source in meyer_idle:
        output = output_root / source.relative_to(source_root)
        png_source = source.with_suffix(".png")
        source_margins = alpha_margins(source)
        output_margins = alpha_margins(output)
        png_margins = alpha_margins(png_source) if png_source.exists() else None
        webp_margin_passed = bool(source_margins and min(source_margins) >= 12)
        png_margin_passed = bool(png_margins and min(png_margins) >= 8)
        margins_exact = source_margins == output_margins
        idle_records.append(
            {
                "frame": str(source.relative_to(source_root)),
                "sourceWebpMargins": source_margins,
                "requiredWebpMargin": 12,
                "sourcePngMargins": png_margins,
                "requiredPngMargin": 8,
                "outputMargins": output_margins,
                "marginsExactAfterStylization": margins_exact,
                "passed": webp_margin_passed and png_margin_passed and margins_exact,
            }
        )
    meyer_passed = (
        len(idle_records) == 4
        and all(bool(record["passed"]) for record in idle_records)
    )
    shipping_gate_passed = captain_passed and meyer_passed
    return {
        "captainGuardbreak": {
            "status": "PASS_REPAIRED" if captain_passed else "FAIL_SOURCE_DEFECT",
            "requirement": (
                "guardbreak 02 has no detached high-alpha remnant; "
                "guardbreak 03 remains one valid connected figure"
            ),
            "scanScope": "whole-canvas 8-connected alpha >= 128",
            "shippingGatePassed": captain_passed,
            "frames": captain_records,
        },
        "meyerIdle": {
            "status": "PASS_REPAIRED" if meyer_passed else "FAIL_SOURCE_DEFECT",
            "requirement": "longsword idle WebP margins >=12px and source PNG margins >=8px",
            "shippingGatePassed": meyer_passed,
            "minimumSourceWebpMarginPixels": min(
                (
                    min(record["sourceWebpMargins"])
                    for record in idle_records
                    if record["sourceWebpMargins"]
                ),
                default=None,
            ),
            "minimumSourcePngMarginPixels": min(
                (
                    min(record["sourcePngMargins"])
                    for record in idle_records
                    if record["sourcePngMargins"]
                ),
                default=None,
            ),
            "frames": idle_records,
        },
        "shippingGatePassed": shipping_gate_passed,
    }


def checkerboard(size: tuple[int, int], square: int = 16) -> Image.Image:
    width, height = size
    y, x = np.indices((height, width))
    alternating = ((x // square + y // square) % 2).astype(np.uint8)
    colors = np.asarray(((49, 48, 52), (67, 65, 70)), dtype=np.uint8)
    return Image.fromarray(colors[alternating], mode="RGB")


def representative_frames(
    actor: str, paths: Sequence[Path], source_root: Path
) -> list[Path]:
    by_suffix = {
        "/".join(path.relative_to(source_root).parts[-2:]): path for path in paths
    }
    requested: dict[str, list[str]] = {
        "meyer": [
            "idle/01.webp",
            "move/02.webp",
            "ls_l1/02.webp",
            "ls_l3/03.webp",
            "ds_l1/02.webp",
            "ds_h/03.webp",
            "hitstun/02.webp",
            "dead/03.webp",
        ],
        "thug": [
            "idle/01.webp",
            "idle/03.webp",
            "move/02.webp",
            "thug_overhead/01.webp",
            "thug_overhead/02.webp",
            "thug_overhead/03.webp",
            "hitstun/02.webp",
            "dead/03.webp",
        ],
        "spear": [
            "idle/01.webp",
            "idle/03.webp",
            "move/02.webp",
            "spear_thrust/01.webp",
            "spear_thrust/02.webp",
            "spear_thrust/03.webp",
            "hitstun/02.webp",
            "dead/03.webp",
        ],
        "wretch": [
            "idle/01.webp",
            "idle/03.webp",
            "move/02.webp",
            "wretch_claw/01.webp",
            "wretch_claw/02.webp",
            "wretch_claw/03.webp",
            "hitstun/02.webp",
            "dead/03.webp",
        ],
        "grotesque": [
            "idle/01.webp",
            "move/02.webp",
            "boss_sweep/02.webp",
            "boss_leap/02.webp",
            "boss_shock/02.webp",
            "boss_shock/03.webp",
            "hitstun/02.webp",
            "dead/03.webp",
        ],
        "captain": [
            "idle/01.webp",
            "move/02.webp",
            "captain_cut/02.webp",
            "captain_cut/03.webp",
            "captain_bash/02.webp",
            "guardbreak/02.webp",
            "hitstun/02.webp",
            "dead/03.webp",
        ],
    }
    selected: list[Path] = []
    seen: set[Path] = set()
    for suffix in requested.get(actor, []):
        path = by_suffix.get(suffix)
        if path is not None and path not in seen:
            selected.append(path)
            seen.add(path)
    if len(selected) < 8:
        remaining = [path for path in paths if path not in seen]
        step = max(1, math.ceil(len(remaining) / max(1, 8 - len(selected))))
        selected.extend(remaining[::step][: 8 - len(selected)])
    return selected[:8]


def draw_sprite_preview(
    actor: str,
    source_paths: Sequence[Path],
    source_root: Path,
    output_root: Path,
    destination: Path,
) -> None:
    samples = representative_frames(actor, source_paths, source_root)
    frame_size = 192
    pair_width = frame_size * 2 + 18
    columns = 2
    rows = math.ceil(len(samples) / columns)
    margin = 20
    header = 54
    label_height = 34
    sheet = Image.new(
        "RGB",
        (
            margin * 2 + pair_width * columns + 20 * (columns - 1),
            header + rows * (frame_size + label_height + 18) + margin,
        ),
        (29, 27, 31),
    )
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 14), f"{actor.upper()} — ORIGINAL / SIMPLIFIED", fill=(235, 226, 205))
    for index, source_path in enumerate(samples):
        row, column = divmod(index, columns)
        left = margin + column * (pair_width + 20)
        top = header + row * (frame_size + label_height + 18)
        relative = source_path.relative_to(source_root)
        output_path = output_root / relative
        for offset, image_path in ((0, source_path), (frame_size + 18, output_path)):
            tile = checkerboard((frame_size, frame_size))
            sprite = Image.open(image_path).convert("RGBA").resize(
                (frame_size, frame_size), Image.Resampling.LANCZOS
            )
            tile.paste(sprite.convert("RGB"), (0, 0), sprite.getchannel("A"))
            sheet.paste(tile, (left + offset, top))
        clip_label = "/".join(relative.parts[-3:])
        draw.text((left, top + frame_size + 6), clip_label, fill=(190, 181, 164))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, optimize=True)


def draw_recovery_preview(
    actor: str,
    source_paths: Sequence[Path],
    source_root: Path,
    output_root: Path,
    destination: Path,
) -> bool:
    samples = sorted(path for path in source_paths if int(path.stem) >= 5)
    if not samples:
        return False
    frame_size = 128
    pair_width = frame_size * 2 + 12
    columns = 3
    rows = math.ceil(len(samples) / columns)
    margin = 18
    header = 50
    label_height = 32
    column_gap = 16
    sheet = Image.new(
        "RGB",
        (
            margin * 2 + pair_width * columns + column_gap * (columns - 1),
            header + rows * (frame_size + label_height + 14) + margin,
        ),
        (29, 27, 31),
    )
    draw = ImageDraw.Draw(sheet)
    draw.text(
        (margin, 14),
        f"{actor.upper()} RECOVERY 05+ - ORIGINAL / SIMPLIFIED",
        fill=(235, 226, 205),
    )
    for index, source_path in enumerate(samples):
        row, column = divmod(index, columns)
        left = margin + column * (pair_width + column_gap)
        top = header + row * (frame_size + label_height + 14)
        relative = source_path.relative_to(source_root)
        output_path = output_root / relative
        for offset, image_path in ((0, source_path), (frame_size + 12, output_path)):
            tile = checkerboard((frame_size, frame_size), square=12)
            sprite = Image.open(image_path).convert("RGBA").resize(
                (frame_size, frame_size), Image.Resampling.LANCZOS
            )
            tile.paste(sprite.convert("RGB"), (0, 0), sprite.getchannel("A"))
            sheet.paste(tile, (left + offset, top))
        label = "/".join(relative.parts[-3:])
        draw.text((left, top + frame_size + 5), label, fill=(190, 181, 164))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, optimize=True)
    return True


def draw_background_preview(
    source_path: Path,
    source_root: Path,
    output_root: Path,
    destination: Path,
) -> None:
    width, height = 640, 360
    margin = 20
    gap = 16
    header = 52
    sheet = Image.new("RGB", (margin * 2 + width * 2 + gap, header + height + margin), (29, 27, 31))
    draw = ImageDraw.Draw(sheet)
    draw.text((margin, 12), f"{source_path.stem.upper()} — ORIGINAL", fill=(235, 226, 205))
    draw.text((margin + width + gap, 12), "GENTLY SIMPLIFIED", fill=(235, 226, 205))
    original = Image.open(source_path).convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    output = Image.open(output_root / source_path.relative_to(source_root)).convert("RGB").resize(
        (width, height), Image.Resampling.LANCZOS
    )
    sheet.paste(original, (margin, header))
    sheet.paste(output, (margin + width + gap, header))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, optimize=True)


def draw_palette_preview(
    actor_palettes: dict[str, np.ndarray],
    background_palettes: dict[str, np.ndarray],
    destination: Path,
) -> None:
    entries = [(name, palette) for name, palette in sorted(actor_palettes.items())]
    entries.extend((f"background/{name}", palette) for name, palette in sorted(background_palettes.items()))
    swatch = 24
    label_width = 160
    row_height = 38
    width = label_width + max(len(palette) for _, palette in entries) * swatch + 20
    image = Image.new("RGB", (width, 20 + len(entries) * row_height), (29, 27, 31))
    draw = ImageDraw.Draw(image)
    for row, (name, palette) in enumerate(entries):
        top = 10 + row * row_height
        draw.text((10, top + 7), name, fill=(225, 216, 198))
        for index, color in enumerate(palette):
            left = label_width + index * swatch
            draw.rectangle(
                (left, top, left + swatch - 2, top + swatch - 2),
                fill=tuple(int(channel) for channel in color),
            )
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def palette_hex(palette: np.ndarray) -> list[str]:
    return ["#" + "".join(f"{int(channel):02x}" for channel in color) for color in palette]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--preview-dir", type=Path)
    parser.add_argument("--actor-colors", type=int, default=16)
    parser.add_argument("--background-colors", type=int, default=48)
    parser.add_argument("--actor-smoothing", type=float, default=0.78)
    parser.add_argument("--background-smoothing", type=float, default=0.7)
    parser.add_argument("--background-saturation", type=float, default=0.7)
    parser.add_argument("--contour-pixels", type=int, default=1)
    parser.add_argument("--interior-cleanup", type=int, default=0)
    parser.add_argument("--alpha-threshold", type=int, default=24)
    parser.add_argument("--expected-sprites", type=int, default=280)
    parser.add_argument("--expected-backgrounds", type=int, default=4)
    args = parser.parse_args()
    if args.actor_colors < 4 or args.background_colors < 8:
        parser.error("actor palettes need >=4 colors and backgrounds need >=8")
    if args.actor_smoothing < 0 or args.background_smoothing < 0:
        parser.error("smoothing radii cannot be negative")
    if not 0.0 <= args.background_saturation <= 1.0:
        parser.error("background saturation must be between 0 and 1")
    if not 0 <= args.contour_pixels <= 3:
        parser.error("contour pixels must be between 0 and 3")
    if args.interior_cleanup not in (0, 3, 5):
        parser.error("interior cleanup must be 0, 3, or 5")
    if not 1 <= args.alpha_threshold <= 255:
        parser.error("alpha threshold must be between 1 and 255")
    return args


def main() -> None:
    args = parse_args()
    source_root = args.source_root.resolve()
    output_root = args.output_root.resolve()
    if output_root == source_root or output_root.is_relative_to(source_root):
        raise SystemExit("output root must be separate from the source art tree")
    sprite_paths = runtime_sprite_paths(source_root)
    backgrounds = background_paths(source_root)
    if args.expected_sprites and len(sprite_paths) != args.expected_sprites:
        raise SystemExit(
            f"expected {args.expected_sprites} sprite frames, found {len(sprite_paths)}"
        )
    if args.expected_backgrounds and len(backgrounds) != args.expected_backgrounds:
        raise SystemExit(
            f"expected {args.expected_backgrounds} backgrounds, found {len(backgrounds)}"
        )

    by_actor: dict[str, list[Path]] = defaultdict(list)
    for path in sprite_paths:
        by_actor[actor_key(path, source_root)].append(path)

    print(f"Building {len(by_actor)} shared actor palettes...")
    actor_palettes = {
        actor: deterministic_palette(
            color_histogram(paths, args.alpha_threshold, include_alpha=True),
            args.actor_colors,
            preserve_actor_accents=True,
        )
        for actor, paths in sorted(by_actor.items())
    }
    background_palettes: dict[str, np.ndarray] = {}
    for path in backgrounds:
        background_palettes[path.stem] = deterministic_palette(
            background_histogram(path, args.background_saturation),
            args.background_colors,
            preserve_actor_accents=False,
        )

    print(f"Stylizing {len(sprite_paths)} sprite frames...")
    for index, source_path in enumerate(sprite_paths, start=1):
        relative = source_path.relative_to(source_root)
        output_path = output_root / relative
        output_path.parent.mkdir(parents=True, exist_ok=True)
        stylize_sprite(
            source_path,
            actor_palettes[actor_key(source_path, source_root)],
            args.actor_smoothing,
            args.contour_pixels,
            args.interior_cleanup,
        ).save(output_path, **WEBP_SAVE_OPTIONS)
        if index % 40 == 0 or index == len(sprite_paths):
            print(f"  sprites {index}/{len(sprite_paths)}")

    print(f"Stylizing {len(backgrounds)} backgrounds...")
    for source_path in backgrounds:
        relative = source_path.relative_to(source_root)
        output_path = output_root / relative
        output_path.parent.mkdir(parents=True, exist_ok=True)
        stylize_background(
            source_path,
            background_palettes[source_path.stem],
            args.background_smoothing,
            args.background_saturation,
        ).save(output_path, **WEBP_SAVE_OPTIONS)

    sprite_validation = validate_sprites(
        sprite_paths, source_root, output_root, actor_palettes
    )
    background_validation = validate_backgrounds(backgrounds, source_root, output_root)
    source_defects = fragile_detail_audit(
        sprite_paths, source_root, output_root
    )
    validation_passed = all(
        (
            sprite_validation["alphaExact"],
            sprite_validation["sizesExact"],
            sprite_validation["alphaBoundsExact"],
            sprite_validation["bottomAnchorsExact"],
            sprite_validation["sharedPaletteExact"],
            background_validation["sizesExact"],
            source_defects["shippingGatePassed"],
        )
    )

    preview_paths: list[Path] = []
    if args.preview_dir:
        preview_dir = args.preview_dir.resolve()
        print(f"Writing comparison sheets to {preview_dir}...")
        for actor, paths in sorted(by_actor.items()):
            destination = preview_dir / f"{actor}-before-after.png"
            draw_sprite_preview(
                actor, paths, source_root, output_root, destination
            )
            preview_paths.append(destination)
            recovery_destination = preview_dir / f"{actor}-recovery-before-after.png"
            if draw_recovery_preview(
                actor,
                paths,
                source_root,
                output_root,
                recovery_destination,
            ):
                preview_paths.append(recovery_destination)
        for source_path in backgrounds:
            destination = preview_dir / f"background-{source_path.stem}-before-after.png"
            draw_background_preview(
                source_path, source_root, output_root, destination
            )
            preview_paths.append(destination)
        palette_preview = preview_dir / "shared-palettes.png"
        draw_palette_preview(actor_palettes, background_palettes, palette_preview)
        preview_paths.append(palette_preview)

    output_files = [output_root / path.relative_to(source_root) for path in [*sprite_paths, *backgrounds]]
    checksums = {
        str(path.relative_to(output_root)): file_sha256(path) for path in output_files
    }
    report = {
        "sourceRoot": str(source_root),
        "outputRoot": str(output_root),
        "parameters": {
            "actorColors": args.actor_colors,
            "backgroundColors": args.background_colors,
            "actorSmoothing": args.actor_smoothing,
            "backgroundSmoothing": args.background_smoothing,
            "backgroundSaturation": args.background_saturation,
            "contourPixels": args.contour_pixels,
            "interiorCleanup": args.interior_cleanup,
            "alphaThreshold": args.alpha_threshold,
            "dithering": False,
            "webpLossless": True,
            "actorPaletteAnchors": [
                "dark contour",
                "neutral steel midtone",
                "neutral steel highlight",
                "two separated high-chroma accents",
            ],
        },
        "counts": {
            "sprites": len(sprite_paths),
            "backgrounds": len(backgrounds),
            "actors": len(by_actor),
        },
        "actorPalettes": {
            name: palette_hex(palette) for name, palette in sorted(actor_palettes.items())
        },
        "backgroundPalettes": {
            name: palette_hex(palette)
            for name, palette in sorted(background_palettes.items())
        },
        "validation": {
            "passed": validation_passed,
            "sprites": sprite_validation,
            "backgrounds": background_validation,
        },
        "sourceDefects": source_defects,
        "previewPaths": [str(path) for path in preview_paths],
        "checksums": checksums,
    }
    output_root.mkdir(parents=True, exist_ok=True)
    report_path = output_root / "stylize-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Validation: {'PASS' if validation_passed else 'FAIL'}")
    print(
        "Source repair gate: "
        + ("PASS (Meyer margins and captain guardbreak repaired)" if source_defects["shippingGatePassed"] else "FAIL")
    )
    print(f"Report: {report_path}")
    if not validation_passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
