#!/usr/bin/env python3
"""Render a real interval-based pixel-sort loop from a still image.

This is an offline visual prototype for Director Open. It intentionally does
not use FFmpeg's shufflepixels filter: eligible contiguous runs are selected by
lightness/edge thresholds, then their source pixels are actually sorted.
"""

from __future__ import annotations

import argparse
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def smoothstep(value: float) -> float:
    value = min(1.0, max(0.0, value))
    return value * value * (3.0 - 2.0 * value)


def cover_image(image: Image.Image, width: int, height: int) -> Image.Image:
    image = image.convert("RGB")
    scale = max(width / image.width, height / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def make_brush_field(width: int, height: int, seed: int) -> np.ndarray:
    """Build coherent multi-scale noise used only to choose sort regions."""
    rng = np.random.default_rng(seed)
    fields: list[np.ndarray] = []
    for cell, weight in ((56, 0.56), (23, 0.29), (9, 0.15)):
        grid_w = max(3, math.ceil(width / cell))
        grid_h = max(3, math.ceil(height / cell))
        grid = (rng.random((grid_h, grid_w)) * 255).astype(np.uint8)
        field = Image.fromarray(grid, mode="L").resize(
            (width, height), Image.Resampling.BICUBIC
        )
        fields.append(np.asarray(field, dtype=np.float32) / 255.0 * weight)
    combined = np.clip(sum(fields), 0.0, 1.0)
    return combined


def colour_keys(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    normalized = rgb.astype(np.float32) / 255.0
    maximum = normalized.max(axis=2)
    minimum = normalized.min(axis=2)
    lightness = (maximum + minimum) * 0.5
    delta = maximum - minimum
    saturation = np.zeros_like(lightness)
    nonzero = delta > 1e-6
    saturation[nonzero] = delta[nonzero] / (
        1.0 - np.abs(2.0 * lightness[nonzero] - 1.0) + 1e-6
    )
    luma = (
        normalized[:, :, 0] * 0.2126
        + normalized[:, :, 1] * 0.7152
        + normalized[:, :, 2] * 0.0722
    )
    return lightness, saturation, luma


def interval_pixel_sort(
    source: np.ndarray,
    severity: float,
    brush_field: np.ndarray,
    seed: int,
) -> np.ndarray:
    """Sort contiguous threshold-selected runs while retaining hard edges."""
    if severity <= 0.001:
        return source.copy()

    height, width, _ = source.shape
    lightness, saturation, luma = colour_keys(source)
    blurred_luma = np.asarray(
        Image.fromarray((luma * 255).astype(np.uint8), mode="L").filter(
            ImageFilter.GaussianBlur(radius=1.25)
        ),
        dtype=np.float32,
    ) / 255.0
    grad_y, grad_x = np.gradient(blurred_luma)
    edge = np.hypot(grad_x, grad_y)

    # Threshold intervals are the defining feature of real pixel sorting.
    # White skies and near-black masses are retained as visual anchors.
    lower = 0.055 + 0.035 * (1.0 - severity)
    upper = 0.91 + 0.025 * severity
    edge_limit = 0.041 + 0.027 * severity
    field_threshold = 0.65 - 0.15 * severity
    eligible = (
        (blurred_luma >= lower)
        & (blurred_luma <= upper)
        & (edge <= edge_limit)
        & (brush_field >= field_threshold)
    )

    # The sort key leans on HSL lightness, with a small saturation term so
    # colour transitions remain painterly instead of becoming grey barcodes.
    sort_key = lightness + saturation * 0.075
    result = source.copy()
    rng = np.random.default_rng(seed)
    maximum_run = max(18, round(24 + 182 * severity**1.45))
    minimum_run = 5
    interval_probability = 0.46 + 0.34 * severity

    for y in range(height):
        row_mask = eligible[y]
        boundaries = np.diff(np.pad(row_mask.astype(np.int8), (1, 1)))
        starts = np.flatnonzero(boundaries == 1)
        stops = np.flatnonzero(boundaries == -1)

        for run_start, run_stop in zip(starts, stops, strict=True):
            if run_stop - run_start < minimum_run:
                continue

            cursor = int(run_start)
            while cursor < run_stop:
                local_field = float(brush_field[y, min(cursor, width - 1)])
                run_scale = 0.48 + 0.78 * local_field
                target = max(
                    minimum_run,
                    round(rng.uniform(0.38, 1.0) * maximum_run * run_scale),
                )
                end = min(int(run_stop), cursor + target)
                if end - cursor >= minimum_run and rng.random() <= interval_probability:
                    keys = sort_key[y, cursor:end]
                    order = np.argsort(keys, kind="stable")
                    # Direction changes in coherent horizontal bands, avoiding
                    # both a mechanical global gradient and per-row static.
                    band_direction = ((y // 9) + (cursor // 113) + seed) & 1
                    if band_direction:
                        order = order[::-1]
                    sorted_pixels = source[y, cursor:end][order]
                    mix = 0.74 + 0.18 * severity
                    blended = (
                        source[y, cursor:end].astype(np.float32) * (1.0 - mix)
                        + sorted_pixels.astype(np.float32) * mix
                    )
                    result[y, cursor:end] = np.clip(blended, 0, 255).astype(np.uint8)

                gap = max(1, round(rng.uniform(1.0, 7.0 - 3.5 * severity)))
                cursor = end + gap

    return result


def envelope(position: float) -> float:
    """Clean hold -> organic build -> peak hold -> clean resolve."""
    if position < 0.16:
        return 0.0
    if position < 0.47:
        return smoothstep((position - 0.16) / 0.31)
    if position < 0.61:
        return 1.0
    if position < 0.92:
        return smoothstep(1.0 - (position - 0.61) / 0.31)
    return 0.0


def render(args: argparse.Namespace) -> None:
    input_path = Path(args.input).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    preview_path = output_path.with_name(f"{output_path.stem}-peak.png")

    source_image = cover_image(Image.open(input_path), args.width, args.height)
    source = np.asarray(source_image, dtype=np.uint8)
    brush_field = make_brush_field(args.width, args.height, args.seed)
    level_values = np.linspace(0.0, 1.0, args.levels)
    levels = [source]
    for index, value in enumerate(level_values[1:], start=1):
        print(f"sorting level {index}/{args.levels - 1}: {value:.2f}", flush=True)
        levels.append(
            interval_pixel_sort(source, float(value), brush_field, args.seed + index * 17)
        )

    Image.fromarray(levels[-1], mode="RGB").save(preview_path, quality=96)
    print(f"peak still: {preview_path}", flush=True)

    command = [
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{args.width}x{args.height}",
        "-r",
        str(args.fps),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        str(args.crf),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    frame_count = round(args.duration * args.fps)
    for frame_number in range(frame_count):
        position = frame_number / max(1, frame_count - 1)
        strength = envelope(position)
        scaled = strength * (args.levels - 1)
        lower_index = min(args.levels - 1, int(math.floor(scaled)))
        upper_index = min(args.levels - 1, lower_index + 1)
        blend = scaled - lower_index
        if blend <= 1e-5:
            frame = levels[lower_index]
        else:
            frame = np.clip(
                levels[lower_index].astype(np.float32) * (1.0 - blend)
                + levels[upper_index].astype(np.float32) * blend,
                0,
                255,
            ).astype(np.uint8)
        process.stdin.write(frame.tobytes())
    process.stdin.close()
    return_code = process.wait()
    if return_code != 0:
        raise SystemExit(f"ffmpeg failed with exit code {return_code}")
    print(f"video: {output_path}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--height", type=int, default=1920)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--duration", type=float, default=6.0)
    parser.add_argument("--levels", type=int, default=7)
    parser.add_argument("--crf", type=int, default=13)
    parser.add_argument("--seed", type=int, default=41)
    return parser.parse_args()


if __name__ == "__main__":
    render(parse_args())
