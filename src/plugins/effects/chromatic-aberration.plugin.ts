import { z } from 'zod';
import { defineEffectPlugin } from '../types';
import { sampleBilinear } from './effectKit';

/**
 * chromatic-aberration — lateral colour fringing that grows toward the corners.
 *
 * Real lenses focus wavelengths at slightly different magnifications, so the
 * red and blue records are scaled fractionally around the optical centre and
 * the error is zero at the middle and largest at the edge. Scaling (rather
 * than a flat pixel offset) is what keeps it looking optical instead of like a
 * 3D-glasses effect, and it makes the result resolution-independent for free.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(45),
  spread: z.number().min(0).max(3).default(1),
  centerX: z.number().min(0).max(1).default(0.5),
  centerY: z.number().min(0).max(1).default(0.5),
});

/** Maximum magnification error at the frame edge, at full strength. */
const MAX_SCALE_ERROR = 0.012;

const chromaticAberrationPlugin = defineEffectPlugin({
  id: 'chromatic-aberration',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Chromatic aberration',
  description: 'Red and blue drift apart toward the corners, like a fast lens wide open.',
  order: 24,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      spread: { control: 'range', label: 'Falloff', min: 0, max: 3, step: 0.1 },
      centerX: { control: 'range', label: 'Centre X', min: 0, max: 1, step: 0.01 },
      centerY: { control: 'range', label: 'Centre Y', min: 0, max: 1, step: 0.01 },
    },
  },
  frameTransform({ sourceRgba, width, height, params }) {
    const out = sourceRgba.slice();
    const gain = params.intensity / 100;
    if (gain <= 0) return out;

    const cx = params.centerX * (width - 1);
    const cy = params.centerY * (height - 1);
    const error = MAX_SCALE_ERROR * gain;
    // Normalise the radius so falloff is measured against the frame, not pixels.
    const maxRadius = Math.max(1, Math.hypot(Math.max(cx, width - 1 - cx), Math.max(cy, height - 1 - cy)));

    for (let y = 0; y < height; y += 1) {
      const dy = y - cy;
      for (let x = 0; x < width; x += 1) {
        const dx = x - cx;
        const radius = Math.hypot(dx, dy) / maxRadius;
        // spread shapes how quickly the error grows away from centre.
        const falloff = params.spread === 1 ? radius : radius ** Math.max(0.05, params.spread);
        const shift = error * falloff;
        const o = (y * width + x) * 4;
        // Red magnifies slightly more, blue slightly less — opposite signs, so
        // the two fringes sit on opposite sides of every edge.
        out[o] = sampleBilinear(sourceRgba, width, height, cx + dx * (1 + shift), cy + dy * (1 + shift), 0);
        out[o + 2] = sampleBilinear(sourceRgba, width, height, cx + dx * (1 - shift), cy + dy * (1 - shift), 2);
      }
    }
    return out;
  },
});

export default chromaticAberrationPlugin;
