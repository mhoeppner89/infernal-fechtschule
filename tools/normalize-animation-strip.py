#!/usr/bin/env python3
"""Extract separated transparent figures from an animation strip.

Image generators do not reliably respect equal-width sprite-sheet cells. Long
weapons and smears often cross an imaginary cell boundary, so slicing by width
damages the very poses that need to read most clearly. This tool finds the main
connected alpha shapes, assigns any small detached marks to the nearest pose,
and normalizes every pose to one shared scale and bottom-center anchor.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def parse_size(value: str) -> tuple[int, int]:
    try:
        width, height = (int(part) for part in value.lower().split("x", 1))
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError("size must look like WIDTHxHEIGHT") from exc
    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError("size dimensions must be positive")
    return width, height


def parse_x_cuts(value: str) -> list[int]:
    try:
        cuts = [int(part) for part in value.split(",") if part.strip()]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("x cuts must be comma-separated integers") from exc
    if not cuts or any(cut <= 0 for cut in cuts):
        raise argparse.ArgumentTypeError("x cuts must be positive integers")
    if cuts != sorted(set(cuts)):
        raise argparse.ArgumentTypeError("x cuts must be unique and increasing")
    return cuts


def parse_grid(value: str) -> tuple[int, int]:
    try:
        columns, rows = (int(part) for part in value.lower().split("x", 1))
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError("grid must look like COLUMNSxROWS") from exc
    if columns <= 0 or rows <= 0:
        raise argparse.ArgumentTypeError("grid dimensions must be positive")
    return columns, rows


def parse_frame_repeat(value: str) -> tuple[int, int]:
    try:
        destination, source = (int(part) for part in value.split(":", 1))
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError(
            "frame repeat must look like DESTINATION:SOURCE, e.g. 4:1"
        ) from exc
    if destination <= 0 or source <= 0:
        raise argparse.ArgumentTypeError("frame numbers must be positive")
    return destination, source


def component_stats(labels: np.ndarray, count: int) -> list[dict[str, object]]:
    objects = ndimage.find_objects(labels)
    stats: list[dict[str, object]] = []
    for label_id in range(1, count + 1):
        slices = objects[label_id - 1]
        if slices is None:
            continue
        ys, xs = slices
        mask = labels[ys, xs] == label_id
        area = int(mask.sum())
        stats.append(
            {
                "id": label_id,
                "area": area,
                "bbox": (xs.start, ys.start, xs.stop, ys.stop),
                "center_x": (xs.start + xs.stop) / 2,
            }
        )
    return stats


def extract_groups(
    rgba: np.ndarray,
    frame_count: int,
    alpha_threshold: int,
    min_fragment_area: int,
) -> list[tuple[np.ndarray, tuple[int, int, int, int]]]:
    alpha = rgba[:, :, 3]
    opaque = alpha > alpha_threshold
    labels, count = ndimage.label(opaque, structure=np.ones((3, 3), dtype=np.uint8))
    stats = component_stats(labels, count)
    anchors = sorted(stats, key=lambda item: int(item["area"]), reverse=True)[:frame_count]
    if len(anchors) != frame_count:
        raise RuntimeError(
            f"found only {len(anchors)} alpha components for {frame_count} frames"
        )
    anchors.sort(key=lambda item: float(item["center_x"]))

    groups: list[list[int]] = [[int(anchor["id"])] for anchor in anchors]
    anchor_ids = {int(anchor["id"]) for anchor in anchors}
    for component in stats:
        component_id = int(component["id"])
        if component_id in anchor_ids or int(component["area"]) < min_fragment_area:
            continue
        nearest = min(
            range(frame_count),
            key=lambda index: abs(
                float(component["center_x"]) - float(anchors[index]["center_x"])
            ),
        )
        groups[nearest].append(component_id)

    extracted: list[tuple[np.ndarray, tuple[int, int, int, int]]] = []
    for group in groups:
        group_mask = np.isin(labels, group)
        ys, xs = np.nonzero(group_mask)
        left, top, right, bottom = (
            int(xs.min()),
            int(ys.min()),
            int(xs.max()) + 1,
            int(ys.max()) + 1,
        )
        crop = rgba[top:bottom, left:right].copy()
        crop_mask = group_mask[top:bottom, left:right]
        crop[:, :, 3] = np.where(crop_mask, crop[:, :, 3], 0)
        extracted.append((crop, (left, top, right, bottom)))
    return extracted


def extract_x_regions(
    rgba: np.ndarray,
    cuts: list[int],
    alpha_threshold: int,
    min_fragment_area: int,
) -> list[tuple[np.ndarray, tuple[int, int, int, int]]]:
    height, width = rgba.shape[:2]
    boundaries = [0, *cuts, width]
    extracted: list[tuple[np.ndarray, tuple[int, int, int, int]]] = []
    for left_edge, right_edge in zip(boundaries, boundaries[1:]):
        region = rgba[:, left_edge:right_edge]
        opaque = region[:, :, 3] > alpha_threshold
        labels, count = ndimage.label(
            opaque, structure=np.ones((3, 3), dtype=np.uint8)
        )
        stats = component_stats(labels, count)
        if not stats:
            raise RuntimeError(
                f"x region {left_edge}:{right_edge} contains no visible pixels"
            )
        anchor = max(stats, key=lambda item: int(item["area"]))
        anchor_area = int(anchor["area"])
        kept_ids = [int(anchor["id"])]
        for component in stats:
            component_id = int(component["id"])
            left, _, right, _ = component["bbox"]
            if (
                component_id != int(anchor["id"])
                and int(component["area"]) >= min_fragment_area
                and (
                    (int(left) > 0 and int(right) < region.shape[1])
                    or int(component["area"]) >= anchor_area * 0.15
                )
            ):
                kept_ids.append(component_id)
        pose_mask = np.isin(labels, kept_ids)
        ys, xs = np.nonzero(pose_mask)
        if len(xs) == 0:
            raise RuntimeError(
                f"x region {left_edge}:{right_edge} contains no visible pixels"
            )
        left = left_edge + int(xs.min())
        top = int(ys.min())
        right = left_edge + int(xs.max()) + 1
        bottom = int(ys.max()) + 1
        crop = rgba[top:bottom, left:right].copy()
        crop_mask = pose_mask[top:bottom, left - left_edge : right - left_edge]
        crop[:, :, 3] = np.where(crop_mask, crop[:, :, 3], 0)
        extracted.append((crop, (left, top, right, bottom)))
    return extracted


def extract_grid_regions(
    rgba: np.ndarray,
    grid: tuple[int, int],
    alpha_threshold: int,
    min_fragment_area: int,
) -> list[tuple[np.ndarray, tuple[int, int, int, int]]]:
    """Extract one pose from each fixed grid cell, in reading order.

    A fixed grid is useful when large smears or prone bodies overlap in x but
    remain isolated inside intentionally authored cells.
    """
    height, width = rgba.shape[:2]
    columns, rows = grid
    x_bounds = [round(index * width / columns) for index in range(columns + 1)]
    y_bounds = [round(index * height / rows) for index in range(rows + 1)]
    extracted: list[tuple[np.ndarray, tuple[int, int, int, int]]] = []

    for row in range(rows):
        for column in range(columns):
            left_edge, right_edge = x_bounds[column], x_bounds[column + 1]
            top_edge, bottom_edge = y_bounds[row], y_bounds[row + 1]
            region = rgba[top_edge:bottom_edge, left_edge:right_edge]
            opaque = region[:, :, 3] > alpha_threshold
            labels, count = ndimage.label(
                opaque, structure=np.ones((3, 3), dtype=np.uint8)
            )
            stats = component_stats(labels, count)
            if not stats:
                raise RuntimeError(
                    f"grid cell {column},{row} contains no visible pixels"
                )
            anchor = max(stats, key=lambda item: int(item["area"]))
            anchor_area = int(anchor["area"])
            kept_ids = [int(anchor["id"])]
            for component in stats:
                component_id = int(component["id"])
                left, top, right, bottom = component["bbox"]
                if (
                    component_id != int(anchor["id"])
                    and int(component["area"]) >= min_fragment_area
                    and (
                        (
                            int(left) > 0
                            and int(right) < region.shape[1]
                            and int(top) > 0
                            and int(bottom) < region.shape[0]
                        )
                        or int(component["area"]) >= anchor_area * 0.15
                    )
                ):
                    kept_ids.append(component_id)
            pose_mask = np.isin(labels, kept_ids)
            ys, xs = np.nonzero(pose_mask)
            if len(xs) == 0:
                raise RuntimeError(
                    f"grid cell {column},{row} contains no visible pixels"
                )
            left = left_edge + int(xs.min())
            top = top_edge + int(ys.min())
            right = left_edge + int(xs.max()) + 1
            bottom = top_edge + int(ys.max()) + 1
            crop = rgba[top:bottom, left:right].copy()
            crop_mask = pose_mask[
                top - top_edge : bottom - top_edge,
                left - left_edge : right - left_edge,
            ]
            crop[:, :, 3] = np.where(crop_mask, crop[:, :, 3], 0)
            extracted.append((crop, (left, top, right, bottom)))
    return extracted


def normalize_frames(
    extracted: list[tuple[np.ndarray, tuple[int, int, int, int]]],
    canvas_size: tuple[int, int],
    padding: int,
) -> tuple[list[Image.Image], float]:
    canvas_width, canvas_height = canvas_size
    max_width = max(crop.shape[1] for crop, _ in extracted)
    max_height = max(crop.shape[0] for crop, _ in extracted)
    scale = min(
        (canvas_width - 2 * padding) / max_width,
        (canvas_height - 2 * padding) / max_height,
    )
    if scale <= 0:
        raise RuntimeError("padding leaves no room for the extracted frames")

    frames: list[Image.Image] = []
    for crop, _ in extracted:
        source = Image.fromarray(crop, mode="RGBA")
        size = (
            max(1, round(source.width * scale)),
            max(1, round(source.height * scale)),
        )
        resized = source.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        x = round((canvas_width - resized.width) / 2)
        y = canvas_height - padding - resized.height
        canvas.alpha_composite(resized, (x, y))
        frames.append(canvas)
    return frames, scale


def write_preview(frames: list[Image.Image], path: Path, cell_size: int) -> None:
    preview = Image.new(
        "RGBA", (cell_size * len(frames), cell_size), (229, 220, 196, 255)
    )
    for index, frame in enumerate(frames):
        thumb = frame.copy()
        thumb.thumbnail((cell_size, cell_size), Image.Resampling.LANCZOS)
        x = index * cell_size + (cell_size - thumb.width) // 2
        y = cell_size - thumb.height
        preview.alpha_composite(thumb, (x, y))
    path.parent.mkdir(parents=True, exist_ok=True)
    preview.convert("RGB").save(path, quality=94)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--frames", type=int, required=True)
    parser.add_argument("--canvas", type=parse_size, default=(640, 640))
    parser.add_argument("--padding", type=int, default=20)
    parser.add_argument("--alpha-threshold", type=int, default=1)
    parser.add_argument("--min-fragment-area", type=int, default=48)
    parser.add_argument(
        "--x-cuts",
        type=parse_x_cuts,
        help="manual x boundaries for touching poses, e.g. 490,950,1450",
    )
    parser.add_argument(
        "--grid",
        type=parse_grid,
        help="fixed pose grid in reading order, e.g. 2x2",
    )
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--preview-cell", type=int, default=360)
    parser.add_argument(
        "--repeat-frame",
        action="append",
        type=parse_frame_repeat,
        default=[],
        metavar="DESTINATION:SOURCE",
        help="replace a damaged pose with another normalized pose, e.g. 4:1",
    )
    parser.add_argument(
        "--runtime-webp-size",
        type=parse_size,
        help="also write runtime WebPs at WIDTHxHEIGHT, e.g. 384x384",
    )
    parser.add_argument("--webp-quality", type=int, default=90)
    args = parser.parse_args()

    image = Image.open(args.input).convert("RGBA")
    rgba = np.asarray(image)
    alpha_min, alpha_max = image.getchannel("A").getextrema()
    if alpha_min == alpha_max:
        raise RuntimeError("input has no usable transparency; extract real alpha first")

    if args.x_cuts and args.grid:
        raise RuntimeError("use either x cuts or a grid, not both")
    if args.x_cuts:
        if len(args.x_cuts) + 1 != args.frames:
            raise RuntimeError("x cuts must define exactly the requested frame count")
        if args.x_cuts[-1] >= rgba.shape[1]:
            raise RuntimeError("x cuts must fall inside the source image")
        extracted = extract_x_regions(
            rgba,
            args.x_cuts,
            args.alpha_threshold,
            args.min_fragment_area,
        )
    elif args.grid:
        columns, rows = args.grid
        if columns * rows != args.frames:
            raise RuntimeError("grid cells must equal the requested frame count")
        extracted = extract_grid_regions(
            rgba,
            args.grid,
            args.alpha_threshold,
            args.min_fragment_area,
        )
    else:
        extracted = extract_groups(
            rgba,
            args.frames,
            args.alpha_threshold,
            args.min_fragment_area,
        )
    frames, scale = normalize_frames(extracted, args.canvas, args.padding)
    for destination, source in args.repeat_frame:
        if destination > len(frames) or source > len(frames):
            raise RuntimeError(
                f"frame repeat {destination}:{source} exceeds {len(frames)} frames"
            )
        frames[destination - 1] = frames[source - 1].copy()
    if not 0 <= args.webp_quality <= 100:
        raise RuntimeError("WebP quality must be between 0 and 100")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames, start=1):
        frame.save(args.output_dir / f"{index:02d}.png")
        if args.runtime_webp_size:
            runtime = frame.resize(args.runtime_webp_size, Image.Resampling.LANCZOS)
            runtime.save(
                args.output_dir / f"{index:02d}.webp",
                format="WEBP",
                quality=args.webp_quality,
                method=6,
            )
    if args.preview:
        write_preview(frames, args.preview, args.preview_cell)

    metadata = {
        "source": str(args.input),
        "frameCount": len(frames),
        "canvas": list(args.canvas),
        "padding": args.padding,
        "sharedScale": scale,
        "sourceBounds": [list(bounds) for _, bounds in extracted],
        "repeatedFrames": [
            {"destination": destination, "source": source}
            for destination, source in args.repeat_frame
        ],
        "runtimeWebp": (
            {"size": list(args.runtime_webp_size), "quality": args.webp_quality}
            if args.runtime_webp_size
            else None
        ),
    }
    (args.output_dir / "normalization.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
