import { z } from 'zod';
import { defineTransitionPlugin } from '../types';
import { EASING_CURVES, EASING_UI_OPTIONS, clamp01 } from '../easing';
import { mix, sampleBilinearInto } from './transitionKit';

/**
 * whip-pan — A whips off-screen with a multi-sample motion-blur smear while B
 * decelerates in from the same direction. Textbook directional box-blur along
 * the pan axis; all offsets are fractions of the frame.
 */
const DIRECTIONS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const;

const ParamsSchema = z.object({
  duration: z.number().min(0.1).max(2).default(0.5),
  easing: z.enum(EASING_CURVES).default('ease-in-out'),
  direction: z.enum(['left', 'right', 'up', 'down']).default('left'),
  blur: z.number().min(0).max(0.4).default(0.16),
  overshoot: z.number().min(1).max(1.6).default(1.25),
  samples: z.number().int().min(2).max(12).default(7),
});

const whipPanPlugin = defineTransitionPlugin({
  id: 'whip-pan',
  kind: 'transition',
  displayName: 'Whip pan',
  description: 'A blurs off-screen and B whips in from the same direction with motion-blur streaks.',
  order: 24,
  previewQuality: 'reduced',
  params: {
    schema: ParamsSchema,
    ui: {
      duration: { control: 'number', label: 'Duration', min: 0.1, max: 2, step: 0.05 },
      easing: { control: 'select', label: 'Easing', options: EASING_UI_OPTIONS },
      direction: { control: 'select', label: 'Direction', options: [
        { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
        { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' },
      ] },
      blur: { control: 'range', label: 'Motion blur', min: 0, max: 0.4, step: 0.01 },
      overshoot: { control: 'range', label: 'Overshoot', min: 1, max: 1.6, step: 0.02 },
      samples: { control: 'range', label: 'Blur samples', min: 2, max: 12, step: 1 },
    },
  },
  preview: ({ progress, width, params }) => ({
    opacity: clamp01(progress),
    translateX: params.direction === 'left' ? -width * progress : params.direction === 'right' ? width * progress : 0,
    translateY: 0,
    scale: 1,
  }),
  ffmpegTransition: ({ params }) => (
    params.direction === 'left' ? 'slideleft'
      : params.direction === 'right' ? 'slideright'
        : params.direction === 'up' ? 'slideup' : 'slidedown'
  ),
  renderFrame({ frameA, frameB, progress, width, height, params }) {
    const out = new Uint8ClampedArray(frameA.length);
    const [ux, uy] = DIRECTIONS[params.direction];
    const span = params.overshoot;
    const shiftA = progress * span; // A leaves toward the direction
    const shiftB = (1 - progress) * span; // B arrives from the direction
    const blurPx = params.blur * Math.min(width, height) * Math.sin(progress * Math.PI);
    const samples = Math.max(1, Math.round(params.samples));
    const crossfade = progress * progress * (3 - 2 * progress);
    const sampleBuffer = new Uint8ClampedArray(4);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let ar = 0, ag = 0, ab = 0, br = 0, bg = 0, bb = 0;
        for (let s = 0; s < samples; s += 1) {
          const t = samples === 1 ? 0 : s / (samples - 1) - 0.5;
          const smear = t * blurPx;
          const ax = x + ux * (shiftA * width + smear);
          const ay = y + uy * (shiftA * height + smear);
          sampleBilinearInto(sampleBuffer, 0, frameA, width, height, ax, ay);
          ar += sampleBuffer[0]; ag += sampleBuffer[1]; ab += sampleBuffer[2];
          const bx = x - ux * (shiftB * width - smear);
          const by = y - uy * (shiftB * height - smear);
          sampleBilinearInto(sampleBuffer, 0, frameB, width, height, bx, by);
          br += sampleBuffer[0]; bg += sampleBuffer[1]; bb += sampleBuffer[2];
        }
        const off = (y * width + x) * 4;
        out[off] = mix(ar / samples, br / samples, crossfade);
        out[off + 1] = mix(ag / samples, bg / samples, crossfade);
        out[off + 2] = mix(ab / samples, bb / samples, crossfade);
        out[off + 3] = 255;
      }
    }
    return out;
  },
});

export default whipPanPlugin;
