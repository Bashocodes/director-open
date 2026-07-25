import { z } from 'zod';
import { defineEffectPlugin } from '../types';
import { boxBlurRgb, highlightPass, screenBlend } from './effectKit';

/**
 * anamorphic-streak — the horizontal blue flare an anamorphic lens throws off
 * bright points.
 *
 * Highlights above a threshold are extracted, blurred on the X axis only (a
 * wide horizontal window against a near-zero vertical one, which is what makes
 * the streak read as a lens artefact rather than a glow), tinted toward the
 * blue end, and screened back. Distinct from halation-bloom, which blooms
 * isotropically and warm.
 *
 * Length is a fraction of frame width, so the streak covers the same portion
 * of the image at 540px preview and 4096px export.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(60),
  length: z.number().min(0.01).max(0.4).default(0.12),
  threshold: z.number().min(0).max(100).default(72),
  tint: z.number().min(0).max(100).default(70),
});

const anamorphicStreakPlugin = defineEffectPlugin({
  id: 'anamorphic-streak',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Anamorphic streak',
  description: 'Horizontal blue flare pulled off the brightest points, like an anamorphic lens.',
  order: 23,
  heavy: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      length: { control: 'range', label: 'Streak length', min: 0.01, max: 0.4, step: 0.005 },
      threshold: { control: 'range', label: 'Threshold', min: 0, max: 100, step: 1, suffix: '%' },
      tint: { control: 'range', label: 'Blue tint', min: 0, max: 100, step: 1, suffix: '%' },
    },
  },
  frameTransform({ sourceRgba, width, height, params }) {
    const out = sourceRgba.slice();
    const gain = params.intensity / 100;
    if (gain <= 0) return out;

    const highlights = highlightPass(sourceRgba, width, height, (params.threshold / 100) * 255);
    // Wide on X, a single pixel on Y: the streak must not become a glow.
    const radiusX = Math.max(1, Math.round(params.length * width));
    const streak = boxBlurRgb(highlights, width, height, radiusX, 1);

    // A horizontal box blur divides energy across its window, so a long streak
    // would fade to nothing. Restore it to a readable level.
    const restore = Math.sqrt(radiusX);
    const tint = params.tint / 100;
    const pixels = width * height;
    for (let p = 0; p < pixels; p += 1) {
      const o = p * 4;
      const b = p * 3;
      const r = streak[b] * restore * gain;
      const g = streak[b + 1] * restore * gain;
      const bl = streak[b + 2] * restore * gain;
      // Bias the flare toward blue by holding blue and pulling red down.
      out[o] = screenBlend(sourceRgba[o], r * (1 - tint * 0.75));
      out[o + 1] = screenBlend(sourceRgba[o + 1], g * (1 - tint * 0.35));
      out[o + 2] = screenBlend(sourceRgba[o + 2], bl * (1 + tint * 0.5));
    }
    return out;
  },
});

export default anamorphicStreakPlugin;
