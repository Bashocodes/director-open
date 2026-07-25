import { z } from 'zod';
import { defineEffectPlugin } from '../types';
import { clamp01, screenBlend, smoothstep } from './effectKit';

/**
 * light-leak — warm fogging bleeding in from one edge, as if the film gate
 * were not quite light-tight.
 *
 * The leak is a procedural radial falloff anchored outside the frame, screened
 * over the image with a warm ramp that runs amber at the core and pink at the
 * fringe. Everything is computed from normalized coordinates, so no texture
 * ships with the plugin and the result is identical at every resolution.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(62),
  corner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right']).default('top-right'),
  reach: z.number().min(0.15).max(1.4).default(0.85),
  warmth: z.number().min(0).max(100).default(70),
});

/** Where the leak's centre sits, in normalized frame coordinates. Outside 0..1 on purpose. */
const ORIGINS: Record<string, { x: number; y: number }> = {
  'top-left': { x: -0.1, y: -0.1 },
  'top-right': { x: 1.1, y: -0.1 },
  'bottom-left': { x: -0.1, y: 1.1 },
  'bottom-right': { x: 1.1, y: 1.1 },
  left: { x: -0.15, y: 0.5 },
  right: { x: 1.15, y: 0.5 },
};

const lightLeakPlugin = defineEffectPlugin({
  id: 'light-leak',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Light leak',
  description: 'Warm fog bleeding in from one edge, like a film gate letting light past.',
  order: 26,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      corner: {
        control: 'select',
        label: 'Origin',
        options: [
          { value: 'top-right', label: 'Top right' },
          { value: 'top-left', label: 'Top left' },
          { value: 'bottom-right', label: 'Bottom right' },
          { value: 'bottom-left', label: 'Bottom left' },
          { value: 'left', label: 'Left edge' },
          { value: 'right', label: 'Right edge' },
        ],
      },
      reach: { control: 'range', label: 'Reach', min: 0.15, max: 1.4, step: 0.05 },
      warmth: { control: 'range', label: 'Warmth', min: 0, max: 100, step: 1, suffix: '%' },
    },
  },
  frameTransform({ sourceRgba, width, height, params }) {
    const out = sourceRgba.slice();
    const gain = params.intensity / 100;
    if (gain <= 0) return out;

    const origin = ORIGINS[params.corner] ?? ORIGINS['top-right'];
    const warmth = params.warmth / 100;
    // Aspect correction keeps the leak circular rather than stretched on 9:16.
    const aspect = width / height;

    for (let y = 0; y < height; y += 1) {
      const ny = height > 1 ? y / (height - 1) : 0;
      for (let x = 0; x < width; x += 1) {
        const nx = width > 1 ? x / (width - 1) : 0;
        const dx = (nx - origin.x) * aspect;
        const dy = ny - origin.y;
        const distance = Math.hypot(dx, dy) / Math.max(aspect, 1);
        // Full strength at the origin, gone by `reach`.
        const falloff = 1 - smoothstep(0, params.reach, distance);
        if (falloff <= 0) continue;
        // Square the falloff so the core is hot and the fringe stays delicate.
        const amount = clamp01(falloff * falloff) * gain * 255;
        const o = (y * width + x) * 4;
        // Amber core, pink fringe: red leads, green trails, blue lifts slightly
        // at the edge where the leak thins out.
        const fringe = 1 - falloff;
        out[o] = screenBlend(sourceRgba[o], amount);
        out[o + 1] = screenBlend(sourceRgba[o + 1], amount * (0.62 + 0.18 * (1 - warmth)));
        out[o + 2] = screenBlend(sourceRgba[o + 2], amount * (0.24 + 0.42 * fringe) * (1 - warmth * 0.5));
      }
    }
    return out;
  },
});

export default lightLeakPlugin;
