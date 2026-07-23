import { z } from 'zod';
import { defineEffectPlugin } from '../types';

const REFERENCE_WIDTH = 1080;
const ONSET_CELL_PX = 2;
const PEAK_CELL_LOW_PX = 6;
const PEAK_CELL_HIGH_PX = 10;
const INK = 12;
const PAPER = 246;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function mix(low: number, high: number, amount: number) {
  return low + (high - low) * clamp01(amount);
}

function effectStrength(intensity: number) {
  const amount = clamp01(intensity / 100);
  return amount <= 0 ? 0 : Math.pow(amount, 0.45);
}

const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(62),
});

/** Exposed for deterministic geometry tests; values are pixels at render width. */
export function halftoneCellSize(width: number, phase: number, intensity: number) {
  const strength = effectStrength(intensity);
  const peakCell = mix(PEAK_CELL_LOW_PX, PEAK_CELL_HIGH_PX, strength);
  const referenceCell = mix(ONSET_CELL_PX, peakCell, clamp01(phase));
  return Math.max(1, Math.round(referenceCell * Math.max(1, width) / REFERENCE_WIDTH));
}

const halftoneRevealPlugin = defineEffectPlugin({
  id: 'halftone-reveal',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Halftone reveal',
  description: 'The image resolves into an editorial monochrome dot grid and back.',
  order: 4,
  heavy: true,
  textureCritical: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: {
        control: 'range',
        label: 'Strength',
        min: 0,
        max: 100,
        step: 1,
        suffix: '%',
      },
    },
  },
  frameTransform({ sourceRgba, width, height, phase: rawPhase, params }) {
    if (sourceRgba.length !== width * height * 4) {
      throw new Error('Halftone source dimensions do not match.');
    }

    const phase = clamp01(rawPhase);
    const strength = effectStrength(params.intensity);
    const amount = phase * Math.min(1, strength * 1.08);
    if (amount <= 0 || width <= 0 || height <= 0) return sourceRgba.slice();

    const cellSize = halftoneCellSize(width, phase, params.intensity);
    const sourceAmount = 1 - amount;
    const output = new Uint8ClampedArray(sourceRgba.length);

    for (let cellTop = 0; cellTop < height; cellTop += cellSize) {
      const cellBottom = Math.min(height, cellTop + cellSize);
      for (let cellLeft = 0; cellLeft < width; cellLeft += cellSize) {
        const cellRight = Math.min(width, cellLeft + cellSize);
        let lumaSum = 0;
        let pixelCount = 0;

        for (let y = cellTop; y < cellBottom; y += 1) {
          let offset = (y * width + cellLeft) * 4;
          for (let x = cellLeft; x < cellRight; x += 1) {
            lumaSum += (54 * sourceRgba[offset]
              + 183 * sourceRgba[offset + 1]
              + 19 * sourceRgba[offset + 2]) / 256;
            pixelCount += 1;
            offset += 4;
          }
        }

        const darkness = 1 - lumaSum / Math.max(1, pixelCount * 255);
        const radius = cellSize * Math.sqrt(Math.max(0, darkness) / Math.PI);
        const radiusSquared = radius * radius;
        const centerX = cellLeft + cellSize * 0.5;
        const centerY = cellTop + cellSize * 0.5;

        for (let y = cellTop; y < cellBottom; y += 1) {
          const dy = y + 0.5 - centerY;
          let offset = (y * width + cellLeft) * 4;
          for (let x = cellLeft; x < cellRight; x += 1) {
            const dx = x + 0.5 - centerX;
            const tone = dx * dx + dy * dy <= radiusSquared ? INK : PAPER;
            output[offset] = sourceRgba[offset] * sourceAmount + tone * amount;
            output[offset + 1] = sourceRgba[offset + 1] * sourceAmount + tone * amount;
            output[offset + 2] = sourceRgba[offset + 2] * sourceAmount + tone * amount;
            output[offset + 3] = sourceRgba[offset + 3];
            offset += 4;
          }
        }
      }
    }

    return output;
  },
});

export default halftoneRevealPlugin;
