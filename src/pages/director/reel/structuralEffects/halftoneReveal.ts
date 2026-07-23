import { clamp01, effectStrength, mix } from '../effectRecipes';
import type { StructuralEffectPlugin } from '../structuralEffects';

const REFERENCE_WIDTH = 1080;
const ONSET_CELL_PX = 2;
const PEAK_CELL_LOW_PX = 6;
const PEAK_CELL_HIGH_PX = 10;
const INK = 12;
const PAPER = 246;

/** Exposed for deterministic geometry tests; values are pixels at the render width. */
export function halftoneCellSize(width: number, phase: number, intensity: number) {
  const strength = effectStrength(intensity);
  const peakCell = mix(PEAK_CELL_LOW_PX, PEAK_CELL_HIGH_PX, strength);
  const referenceCell = mix(ONSET_CELL_PX, peakCell, clamp01(phase));
  return Math.max(1, Math.round(referenceCell * Math.max(1, width) / REFERENCE_WIDTH));
}

const renderFrame: StructuralEffectPlugin['renderFrame'] = (
  sourceRgba,
  width,
  height,
  options,
) => {
  if (sourceRgba.length !== width * height * 4) {
    throw new Error('Halftone source dimensions do not match.');
  }

  const phase = clamp01(options.phase);
  const strength = effectStrength(options.intensity);
  const amount = phase * Math.min(1, strength * 1.08);
  if (amount <= 0 || width <= 0 || height <= 0) return sourceRgba.slice();

  const cellSize = halftoneCellSize(width, phase, options.intensity);
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
          // Integer Rec. 709 coefficients keep this hot path inexpensive.
          lumaSum += (54 * sourceRgba[offset]
            + 183 * sourceRgba[offset + 1]
            + 19 * sourceRgba[offset + 2]) / 256;
          pixelCount += 1;
          offset += 4;
        }
      }

      const darkness = 1 - lumaSum / Math.max(1, pixelCount * 255);
      // Dot area tracks darkness. The slight overlap at near-black fills shadows
      // while preserving the regular print grid through the midtones.
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
};

export const halftoneRevealPlugin = {
  id: 'halftone-reveal' as const,
  renderFrame,
} satisfies {
  id: 'halftone-reveal';
  renderFrame: StructuralEffectPlugin['renderFrame'];
};
