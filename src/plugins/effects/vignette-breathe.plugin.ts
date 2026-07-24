import { z } from 'zod';
import { defineEffectPlugin } from '../types';

/**
 * vignette-breathe — a radial vignette whose intensity oscillates very slowly
 * across the clip (an eased "breath"). `period` is the number of full breaths
 * over the clip. Pre-motion frameTransform → identical preview and export.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(42),
  period: z.number().min(0.25).max(4).default(1),
  softness: z.number().min(0.2).max(1).default(0.6),
});

const vignetteBreathePlugin = defineEffectPlugin({
  id: 'vignette-breathe',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Vignette breathe',
  description: 'A slow, eased vignette that gently breathes in and out.',
  order: 22,
  heavy: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      period: { control: 'range', label: 'Breaths', min: 0.25, max: 4, step: 0.25 },
      softness: { control: 'range', label: 'Softness', min: 0.2, max: 1, step: 0.05 },
    },
  },
  frameTransform({ sourceRgba, width, height, progress, params }) {
    const out = sourceRgba.slice();
    const base = (params.intensity / 100) * 0.55;
    const amplitude = (params.intensity / 100) * 0.35;
    // Eased breath: a raised-cosine oscillation in [0,1].
    const breath = 0.5 - 0.5 * Math.cos(progress * params.period * Math.PI * 2);
    const strength = base + amplitude * breath;
    if (strength <= 0) return out;
    const cx = width / 2;
    const cy = height / 2;
    const maxDist = Math.hypot(cx, cy);
    const inner = params.softness;

    for (let y = 0; y < height; y += 1) {
      const dy = (y + 0.5 - cy) / maxDist;
      for (let x = 0; x < width; x += 1) {
        const dx = (x + 0.5 - cx) / maxDist;
        const dist = Math.hypot(dx, dy);
        // Smooth falloff from `inner` outward.
        const t = Math.min(1, Math.max(0, (dist - inner) / Math.max(1e-4, 1 - inner)));
        const falloff = t * t * (3 - 2 * t);
        const factor = 1 - strength * falloff;
        const off = (y * width + x) * 4;
        out[off] = sourceRgba[off] * factor;
        out[off + 1] = sourceRgba[off + 1] * factor;
        out[off + 2] = sourceRgba[off + 2] * factor;
      }
    }
    return out;
  },
});

export default vignetteBreathePlugin;
