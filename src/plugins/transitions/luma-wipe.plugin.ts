import { z } from 'zod';
import { defineTransitionPlugin } from '../types';
import { EASING_CURVES, EASING_UI_OPTIONS, clamp01 } from '../easing';
import { fractalNoise2D, hashSeed, mix } from './transitionKit';

/**
 * luma-wipe — B is revealed according to a procedural luma map (radial, diagonal,
 * or generated noise); dark or bright zones cross over first. Textbook luma-key
 * dissolve; the map is generated from normalized coordinates.
 */
const ParamsSchema = z.object({
  duration: z.number().min(0.1).max(3).default(0.8),
  easing: z.enum(EASING_CURVES).default('ease-in-out'),
  map: z.enum(['radial', 'diagonal', 'noise']).default('radial'),
  invert: z.boolean().default(false),
  softness: z.number().min(0.02).max(0.5).default(0.18),
  seed: z.number().int().min(0).max(9999).default(17),
});

const lumaWipePlugin = defineTransitionPlugin({
  id: 'luma-wipe',
  kind: 'transition',
  displayName: 'Luma wipe',
  description: 'B appears through A’s dark or bright zones using a procedural luma map.',
  order: 23,
  previewQuality: 'full',
  params: {
    schema: ParamsSchema,
    ui: {
      duration: { control: 'number', label: 'Duration', min: 0.1, max: 3, step: 0.05 },
      easing: { control: 'select', label: 'Easing', options: EASING_UI_OPTIONS },
      map: { control: 'select', label: 'Luma map', options: [{ value: 'radial', label: 'Radial' }, { value: 'diagonal', label: 'Diagonal' }, { value: 'noise', label: 'Noise' }] },
      invert: { control: 'toggle', label: 'Bright zones first' },
      softness: { control: 'range', label: 'Softness', min: 0.02, max: 0.5, step: 0.01 },
    },
  },
  preview: ({ progress }) => ({ opacity: clamp01(progress), translateX: 0, translateY: 0, scale: 1 }),
  ffmpegTransition: () => 'fade',
  renderFrame({ frameA, frameB, progress, width, height, params }) {
    const out = new Uint8ClampedArray(frameA.length);
    const seed = hashSeed(params.seed);
    const softness = Math.max(1e-4, params.softness);

    for (let y = 0; y < height; y += 1) {
      const ny = y / height;
      for (let x = 0; x < width; x += 1) {
        const nx = x / width;
        let mapValue: number;
        if (params.map === 'radial') {
          const dx = nx - 0.5;
          const dy = ny - 0.5;
          mapValue = clamp01(Math.hypot(dx, dy) / 0.7071);
        } else if (params.map === 'diagonal') {
          mapValue = (nx + ny) / 2;
        } else {
          mapValue = fractalNoise2D(nx * 6, ny * 6, seed);
        }
        const keyed = params.invert ? 1 - mapValue : mapValue;
        let mixB = clamp01((progress - keyed) / softness + 0.5);
        mixB = mixB * mixB * (3 - 2 * mixB);
        const off = (y * width + x) * 4;
        out[off] = mix(frameA[off], frameB[off], mixB);
        out[off + 1] = mix(frameA[off + 1], frameB[off + 1], mixB);
        out[off + 2] = mix(frameA[off + 2], frameB[off + 2], mixB);
        out[off + 3] = 255;
      }
    }
    return out;
  },
});

export default lumaWipePlugin;
