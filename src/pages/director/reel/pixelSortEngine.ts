import {
  clamp01,
  deterministicHash,
  effectStrength,
  mix,
} from './effectRecipes';
import { canvasPngBlob, decodeRgbaWorkspace } from './rgbaWorkspace';

export type PixelSortOptions = {
  intensity: number;
  seed: number;
  /** Morphology progression. Zero is clean; one is the full displacement plate. */
  phase?: number;
};

// Two real morphology plates plus the clean source create a three-state arc.
// The former extra weak plate consumed another full decoded 1080p stream in
// ffmpeg.wasm while adding very little visible structure.
export const PIXEL_SORT_PHASES = [0.32, 0.88] as const;

const REFERENCE_WIDTH = 1_080;
const BRUSH_OCTAVES = [
  { cell: 56, weight: 0.56 },
  { cell: 23, weight: 0.29 },
  { cell: 9, weight: 0.15 },
] as const;

function smoothstep(value: number) {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
}

/** Build a stationary, coherent value-noise field with no positional focus. */
function makeBrushField(width: number, height: number, seed: number) {
  const field = new Float32Array(width * height);
  const seedPhase = seed * 1_000_003;
  for (const [octave, { cell, weight }] of BRUSH_OCTAVES.entries()) {
    const cellSize = Math.max(1, cell * width / REFERENCE_WIDTH);
    const phaseX = (deterministicHash(seedPhase + octave * 193.17 + 17.31) + 1) * 0.5 * cellSize;
    const phaseY = (deterministicHash(seedPhase + octave * 317.93 + 41.73) + 1) * 0.5 * cellSize;
    const xIndexes = new Int32Array(width);
    const xMixes = new Float32Array(width);
    let gridWidth = 2;
    for (let x = 0; x < width; x += 1) {
      const position = (x + phaseX) / cellSize;
      const index = Math.floor(position);
      xIndexes[x] = index;
      xMixes[x] = smoothstep(position - index);
      gridWidth = Math.max(gridWidth, index + 2);
    }
    const yIndexes = new Int32Array(height);
    const yMixes = new Float32Array(height);
    let gridHeight = 2;
    for (let y = 0; y < height; y += 1) {
      const position = (y + phaseY) / cellSize;
      const index = Math.floor(position);
      yIndexes[y] = index;
      yMixes[y] = smoothstep(position - index);
      gridHeight = Math.max(gridHeight, index + 2);
    }

    // Expand each sparse random row horizontally once, then interpolate those
    // rows vertically. The finished field is a single lookup in the sort loop.
    const horizontalRows = new Float32Array(gridHeight * width);
    const gridRow = new Float32Array(gridWidth);
    for (let gridY = 0; gridY < gridHeight; gridY += 1) {
      for (let gridX = 0; gridX < gridWidth; gridX += 1) {
        gridRow[gridX] = (deterministicHash(
          seedPhase + octave * 7_919.17 + gridX * 101.31 + gridY * 313.77,
        ) + 1) * 0.5;
      }
      const rowOffset = gridY * width;
      for (let x = 0; x < width; x += 1) {
        const gridX = xIndexes[x];
        const left = gridRow[gridX];
        horizontalRows[rowOffset + x] = left + (gridRow[gridX + 1] - left) * xMixes[x];
      }
    }
    for (let y = 0; y < height; y += 1) {
      const upperOffset = yIndexes[y] * width;
      const lowerOffset = upperOffset + width;
      const outputOffset = y * width;
      const amount = yMixes[y];
      for (let x = 0; x < width; x += 1) {
        const upper = horizontalRows[upperOffset + x];
        field[outputOffset + x] += (upper + (horizontalRows[lowerOffset + x] - upper) * amount) * weight;
      }
    }
  }
  return field;
}

/** Sobel combines a light 3×3 blur with a centered luma gradient. */
function blurredLumaGradientAt(luma: Float32Array, pixel: number, width: number) {
  const upper = pixel - width;
  const lower = pixel + width;
  const gradientX = (
    luma[upper + 1] + luma[pixel + 1] * 2 + luma[lower + 1]
    - luma[upper - 1] - luma[pixel - 1] * 2 - luma[lower - 1]
  ) * 0.125;
  const gradientY = (
    luma[lower - 1] + luma[lower] * 2 + luma[lower + 1]
    - luma[upper - 1] - luma[upper] * 2 - luma[upper + 1]
  ) * 0.125;
  return Math.sqrt(gradientX * gradientX + gradientY * gradientY);
}

/**
 * Sort real contiguous source-pixel intervals selected by lightness, edges and
 * a coherent brush field. This intentionally never shuffles arbitrary blocks.
 */
export function pixelSortRgba(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  options: PixelSortOptions,
) {
  if (source.length !== width * height * 4) throw new Error('Pixel-sort source dimensions do not match.');
  const strength = effectStrength(options.intensity);
  const morphology = clamp01(options.phase ?? 1) * strength;
  if (morphology <= 0.001) return source.slice();

  const pixelCount = width * height;
  const luma = new Float32Array(pixelCount);
  const sortKey = new Float32Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const red = source[offset] / 255;
    const green = source[offset + 1] / 255;
    const blue = source[offset + 2] / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const lightness = (maximum + minimum) * 0.5;
    const delta = maximum - minimum;
    const saturation = delta <= 0.000001
      ? 0
      : delta / (1 - Math.abs(2 * lightness - 1) + 0.000001);
    luma[pixel] = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    sortKey[pixel] = lightness + saturation * 0.075;
  }

  const output = source.slice();
  const brushField = makeBrushField(width, height, options.seed);
  // Classic pixel sorting gets its long, coherent streaks from threshold
  // boundaries. The previous implementation broke those runs into small,
  // randomized pieces, which produced a weak digital smear instead.
  const lowerThreshold = mix(0.09, 0.05, morphology);
  const upperThreshold = mix(0.9, 0.935, morphology);
  const fieldThreshold = mix(0.65, 0.5, morphology);
  const edgeLimit = 0.041 + 0.027 * morphology;
  const minimumRun = 5;
  const maximumRun = Math.max(
    18,
    Math.round((24 + 182 * morphology ** 1.45) * width / REFERENCE_WIDTH),
  );
  const intervalProbability = mix(0.68, 0.985, morphology);
  const pixelMix = mix(0.74, 0.92, morphology);
  const seedPhase = Math.round(options.seed * 1_000_003);

  const eligible = (pixel: number, y: number) => {
    const value = sortKey[pixel];
    return value >= lowerThreshold
      && value <= upperThreshold
      && brushField[pixel] >= fieldThreshold
      && y > 0
      && y < height - 1
      && blurredLumaGradientAt(luma, pixel, width) <= edgeLimit;
  };

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width;
    let x = 1;
    while (x < width - 1) {
      while (x < width - 1 && !eligible(rowStart + x, y)) x += 1;
      const eligibleStop = (() => {
        let stop = x;
        while (stop < width - 1 && eligible(rowStart + stop, y)) stop += 1;
        return stop;
      })();

      let cursor = x;
      while (cursor < eligibleStop) {
        const lengthNoise = (deterministicHash(cursor * 0.73 + Math.floor(y / 5) * 17.17 + seedPhase) + 1) * 0.5;
        const localField = brushField[y * width + cursor];
        const targetLength = Math.max(minimumRun, Math.round(
          maximumRun * (0.64 + lengthNoise * 0.36) * (0.76 + localField * 0.31),
        ));
        const stop = Math.min(eligibleStop, cursor + targetLength);
        const runLength = stop - cursor;
        const selectionNoise = (deterministicHash(cursor * 3.11 + y * 41.7 + seedPhase * 0.17) + 1) * 0.5;
        if (runLength >= minimumRun && selectionNoise <= intervalProbability) {
          const indexes = Array.from({ length: runLength }, (_, index) => index);
          const runStart = rowStart + cursor;
          indexes.sort((left, right) => sortKey[runStart + left] - sortKey[runStart + right]);
          if (((Math.floor(y / 17) + Math.floor(cursor / Math.max(97, width * 0.16)) + seedPhase) & 1) === 1) {
            indexes.reverse();
          }
          for (let destination = 0; destination < runLength; destination += 1) {
            const destinationOffset = (runStart + destination) * 4;
            const sourceOffset = (runStart + indexes[destination]) * 4;
            for (let channel = 0; channel < 3; channel += 1) {
              output[destinationOffset + channel] = Math.round(
                source[destinationOffset + channel] * (1 - pixelMix)
                + source[sourceOffset + channel] * pixelMix,
              );
            }
            output[destinationOffset + 3] = source[destinationOffset + 3];
          }
        }
        const gapNoise = (deterministicHash(cursor * 1.37 + y * 5.93 + seedPhase * 0.31) + 1) * 0.5;
        cursor = stop + Math.max(1, Math.round(1 + gapNoise * mix(5, 1.5, morphology)));
      }
      x = Math.max(x + 1, eligibleStop + 1);
    }
  }
  return output;
}

export async function makePixelSortPlate(options: {
  bytes: Uint8Array;
  extension: string;
  width: number;
  height: number;
  intensity: number;
  seed: number;
  phase?: number;
}) {
  const plates = await makePixelSortPlates({
    ...options,
    phases: [options.phase ?? 1],
  });
  return plates[0];
}

/** Decode and crop once, then derive the complete temporal morphology arc. */
export async function makePixelSortPlates(options: {
  bytes: Uint8Array;
  extension: string;
  width: number;
  height: number;
  intensity: number;
  seed: number;
  phases?: readonly number[];
}) {
  const workspace = await decodeRgbaWorkspace(options);
  try {
    const plates: Uint8Array[] = [];
    for (const phase of options.phases || PIXEL_SORT_PHASES) {
      workspace.frame.data.set(pixelSortRgba(workspace.source, options.width, options.height, { ...options, phase }));
      workspace.context.putImageData(workspace.frame, 0, 0);
      plates.push(new Uint8Array(await (await canvasPngBlob(workspace.canvas)).arrayBuffer()));
    }
    return plates;
  } finally {
    workspace.bitmap.close();
  }
}
