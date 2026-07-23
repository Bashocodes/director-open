import { z } from 'zod';
import { defineTransitionPlugin } from '../types';
import { EASING_CURVES, EASING_UI_OPTIONS, clamp01 } from '../easing';
import { mix } from './transitionKit';

/**
 * dip-to — dip through black or white with asymmetric timing (fast out, slow in).
 * A full-frame color dip; the split point controls where the frame is fully
 * dipped. Returns exactly A at 0 and B at 1.
 *
 * Engine easing defaults to 'linear' on purpose: the asymmetry is produced by
 * the internal ease-out (A→dip) / ease-in (dip→B) split, so an additional engine
 * ease would double-apply.
 */
const ParamsSchema = z.object({
  duration: z.number().min(0.1).max(2).default(0.6),
  easing: z.enum(EASING_CURVES).default('linear'),
  color: z.enum(['black', 'white']).default('black'),
  split: z.number().min(0.2).max(0.8).default(0.4),
});

const dipToPlugin = defineTransitionPlugin({
  id: 'dip-to',
  kind: 'transition',
  displayName: 'Dip to color',
  description: 'A cinematic breath through black or white — fast out, slow in.',
  order: 25,
  previewQuality: 'full',
  params: {
    schema: ParamsSchema,
    ui: {
      duration: { control: 'number', label: 'Duration', min: 0.1, max: 2, step: 0.05 },
      easing: { control: 'select', label: 'Easing', options: EASING_UI_OPTIONS },
      color: { control: 'select', label: 'Dip color', options: [{ value: 'black', label: 'Black' }, { value: 'white', label: 'White' }] },
      split: { control: 'range', label: 'Dip point', min: 0.2, max: 0.8, step: 0.02 },
    },
  },
  preview: ({ progress }) => ({ opacity: clamp01(progress * 2), translateX: 0, translateY: 0, scale: 1 }),
  ffmpegTransition: ({ params }) => (params.color === 'white' ? 'fadewhite' : 'fadeblack'),
  renderFrame({ frameA, frameB, progress, width, height, params }) {
    const out = new Uint8ClampedArray(frameA.length);
    const dip = params.color === 'white' ? 255 : 0;
    const split = clamp01(params.split);
    let source: Uint8ClampedArray;
    let toDip: number;
    if (progress <= split) {
      // Fast out: A → dip.
      const t = split <= 0 ? 1 : progress / split;
      toDip = 1 - (1 - t) * (1 - t); // ease-out
      source = frameA;
    } else {
      // Slow in: dip → B.
      const t = (progress - split) / Math.max(1e-4, 1 - split);
      toDip = 1 - t * t; // ease-in toward B (0 = dip fully, 1 = B)
      source = frameB;
    }
    for (let i = 0; i < out.length; i += 4) {
      out[i] = mix(source[i], dip, toDip);
      out[i + 1] = mix(source[i + 1], dip, toDip);
      out[i + 2] = mix(source[i + 2], dip, toDip);
      out[i + 3] = 255;
    }
    void width; void height;
    return out;
  },
});

export default dipToPlugin;
