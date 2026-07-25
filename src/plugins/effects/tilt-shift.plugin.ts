import { z } from 'zod';
import { defineEffectPlugin } from '../types';
import { boxBlurRgb, clamp01, smoothstep } from './effectKit';

/**
 * tilt-shift — a sharp band across the frame with blur falling away from it.
 *
 * A blurred copy of the whole frame is mixed back per pixel against a mask
 * derived from distance to the focus band. Blending one fully blurred plate
 * (rather than varying blur radius per row) keeps cost independent of the
 * gradient and avoids the banding a stepped-radius approach produces.
 *
 * Band position, width and feather are fractions of the frame's height (or
 * width when vertical), so the composition holds at any resolution.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(70),
  position: z.number().min(0).max(1).default(0.5),
  bandWidth: z.number().min(0.02).max(0.9).default(0.26),
  feather: z.number().min(0.01).max(0.5).default(0.16),
  radius: z.number().min(0.004).max(0.06).default(0.018),
  orientation: z.enum(['horizontal', 'vertical']).default('horizontal'),
});

const tiltShiftPlugin = defineEffectPlugin({
  id: 'tilt-shift',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Tilt shift',
  description: 'Holds one band in focus and lets the rest fall away, shrinking the scene.',
  order: 25,
  heavy: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      position: { control: 'range', label: 'Band position', min: 0, max: 1, step: 0.01 },
      bandWidth: { control: 'range', label: 'Band width', min: 0.02, max: 0.9, step: 0.01 },
      feather: { control: 'range', label: 'Feather', min: 0.01, max: 0.5, step: 0.01 },
      radius: { control: 'range', label: 'Blur radius', min: 0.004, max: 0.06, step: 0.002 },
      orientation: {
        control: 'select',
        label: 'Orientation',
        options: [
          { value: 'horizontal', label: 'Horizontal band' },
          { value: 'vertical', label: 'Vertical band' },
        ],
      },
    },
  },
  frameTransform({ sourceRgba, width, height, params }) {
    const out = sourceRgba.slice();
    const gain = params.intensity / 100;
    if (gain <= 0) return out;

    const pixels = width * height;
    const rgb = new Float32Array(pixels * 3);
    for (let p = 0; p < pixels; p += 1) {
      const o = p * 4;
      rgb[p * 3] = sourceRgba[o];
      rgb[p * 3 + 1] = sourceRgba[o + 1];
      rgb[p * 3 + 2] = sourceRgba[o + 2];
    }

    const shortEdge = Math.min(width, height);
    const radiusPx = Math.max(1, Math.round(params.radius * shortEdge));
    const blurred = boxBlurRgb(rgb, width, height, radiusPx, radiusPx);

    const vertical = params.orientation === 'vertical';
    const axisLength = vertical ? width : height;
    const center = params.position * (axisLength - 1);
    const halfBand = (params.bandWidth / 2) * axisLength;
    const featherPx = Math.max(1, params.feather * axisLength);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const position = vertical ? x : y;
        const distance = Math.abs(position - center);
        // 0 inside the band, rising to 1 once past the feather.
        const mix = smoothstep(halfBand, halfBand + featherPx, distance) * gain;
        if (mix <= 0) continue;
        const p = y * width + x;
        const o = p * 4;
        const b = p * 3;
        const keep = clamp01(1 - mix);
        out[o] = sourceRgba[o] * keep + blurred[b] * mix;
        out[o + 1] = sourceRgba[o + 1] * keep + blurred[b + 1] * mix;
        out[o + 2] = sourceRgba[o + 2] * keep + blurred[b + 2] * mix;
      }
    }
    return out;
  },
});

export default tiltShiftPlugin;
