import { clamp01, deterministicHash, effectStrength } from '../effectRecipes';
import type { StructuralEffectFrameOptions } from '../structuralEffects';

function smoothstep(value: number) {
  const bounded = clamp01(value);
  return bounded * bounded * (3 - 2 * bounded);
}

/** Graphic two-tone threshold treatment whose boundary crawls as the threshold drifts. */
export const thresholdMeltPlugin = {
  id: 'threshold-melt' as const,
  renderFrame(
    sourceRgba: Uint8ClampedArray,
    width: number,
    height: number,
    options: StructuralEffectFrameOptions,
  ) {
    if (options.phase <= 0 || options.intensity <= 0) return sourceRgba.slice();
    const strength = effectStrength(options.intensity);
    const mixAmount = smoothstep(options.phase) * Math.min(1, strength * 1.08);
    if (mixAmount <= 0) return sourceRgba.slice();

    const output = sourceRgba.slice();
    const baseSeed = options.baseSeed ?? options.seed;
    const threshold = 0.5 + Math.sin(options.progress * Math.PI * 1.6 + baseSeed * Math.PI * 2) * 0.08 * strength;
    const boundaryDither = 0.026 * strength;
    const dark = [7, 8, 10] as const;
    const paper = [246, 242, 231] as const;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        const luma = (
          sourceRgba[offset] * 0.2126
          + sourceRgba[offset + 1] * 0.7152
          + sourceRgba[offset + 2] * 0.0722
        ) / 255;
        const dither = deterministicHash(
          x * 0.754877666 + y * 0.569840291 + options.seed * 97.131,
        ) * boundaryDither;
        const tone = luma + dither >= threshold ? paper : dark;
        output[offset] = Math.round(sourceRgba[offset] + (tone[0] - sourceRgba[offset]) * mixAmount);
        output[offset + 1] = Math.round(sourceRgba[offset + 1] + (tone[1] - sourceRgba[offset + 1]) * mixAmount);
        output[offset + 2] = Math.round(sourceRgba[offset + 2] + (tone[2] - sourceRgba[offset + 2]) * mixAmount);
        output[offset + 3] = sourceRgba[offset + 3];
      }
    }
    return output;
  },
};
