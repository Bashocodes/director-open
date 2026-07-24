import { z } from 'zod';
import { defineEffectPlugin } from '../types';
import { hashSeed, valueNoise2D } from '../transitions/transitionKit';

/**
 * film-grain — procedural, animated, luminance-aware grain. A pre-motion
 * frameTransform, so the SAME code renders preview and export (via the
 * structural-effect frame sequence). Grain is seeded per frame for animation
 * and stays deterministic. Cell size is normalized to a 1080-wide reference.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(45),
  size: z.number().min(0.5).max(4).default(1.4),
});

function clampByte(value: number) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

const filmGrainPlugin = defineEffectPlugin({
  id: 'film-grain',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Film grain',
  description: 'Procedural animated grain, strongest in the midtones.',
  order: 20,
  heavy: true,
  textureCritical: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      size: { control: 'range', label: 'Grain size', min: 0.5, max: 4, step: 0.1 },
    },
  },
  frameTransform({ sourceRgba, width, height, seed, frameIndex, params }) {
    const out = sourceRgba.slice();
    const amount = (params.intensity / 100) * 70;
    if (amount <= 0) return out;
    const cell = Math.max(1, Math.round((params.size * width) / 1080));
    const frameSeed = hashSeed(seed, frameIndex ?? 0);
    for (let y = 0; y < height; y += 1) {
      const cy = Math.floor(y / cell);
      for (let x = 0; x < width; x += 1) {
        const off = (y * width + x) * 4;
        const cx = Math.floor(x / cell);
        const noise = valueNoise2D(cx, cy, frameSeed) * 2 - 1;
        const luma = (sourceRgba[off] * 0.3 + sourceRgba[off + 1] * 0.6 + sourceRgba[off + 2] * 0.1) / 255;
        const weight = Math.max(0.25, 1 - Math.abs(luma - 0.5) * 1.3);
        const delta = noise * amount * weight;
        out[off] = clampByte(sourceRgba[off] + delta);
        out[off + 1] = clampByte(sourceRgba[off + 1] + delta);
        out[off + 2] = clampByte(sourceRgba[off + 2] + delta);
      }
    }
    return out;
  },
});

export default filmGrainPlugin;
