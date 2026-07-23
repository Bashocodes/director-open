import { z } from 'zod';
import { defineTransitionPlugin } from '../types';
import { EASING_CURVES, EASING_UI_OPTIONS, clamp01 } from '../easing';
import { fractalNoise2D, hashSeed, mix, sampleBilinearInto } from './transitionKit';

/**
 * liquid-melt — a flowing procedural-noise threshold melts frame B in while the
 * image is displaced along the melt axis. Value/gradient noise is implemented
 * inline (transitionKit); no noise library. Spatial quantities are fractions.
 */
const ParamsSchema = z.object({
  duration: z.number().min(0.1).max(3).default(0.9),
  easing: z.enum(EASING_CURVES).default('ease-in-out'),
  axis: z.enum(['vertical', 'horizontal']).default('vertical'),
  cellSize: z.number().min(0.05).max(0.6).default(0.2),
  displacement: z.number().min(0).max(0.2).default(0.06),
  softness: z.number().min(0.02).max(0.4).default(0.14),
  flow: z.number().min(0).max(0.4).default(0.12),
  seed: z.number().int().min(0).max(9999).default(41),
});

const liquidMeltPlugin = defineTransitionPlugin({
  id: 'liquid-melt',
  kind: 'transition',
  displayName: 'Liquid melt',
  description: 'B seeps in through a flowing procedural-noise threshold with a melting displacement.',
  order: 21,
  previewQuality: 'full',
  params: {
    schema: ParamsSchema,
    ui: {
      duration: { control: 'number', label: 'Duration', min: 0.1, max: 3, step: 0.05 },
      easing: { control: 'select', label: 'Easing', options: EASING_UI_OPTIONS },
      axis: { control: 'select', label: 'Axis', options: [{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }] },
      cellSize: { control: 'range', label: 'Noise scale', min: 0.05, max: 0.6, step: 0.01 },
      displacement: { control: 'range', label: 'Displacement', min: 0, max: 0.2, step: 0.005 },
      softness: { control: 'range', label: 'Threshold softness', min: 0.02, max: 0.4, step: 0.01 },
      flow: { control: 'range', label: 'Flow', min: 0, max: 0.4, step: 0.01 },
    },
  },
  preview: ({ progress }) => ({ opacity: clamp01(progress), translateX: 0, translateY: 0, scale: 1 }),
  ffmpegTransition: () => 'dissolve',
  renderFrame({ frameA, frameB, progress, width, height, params }) {
    const out = new Uint8ClampedArray(frameA.length);
    const minDim = Math.min(width, height);
    const seed = hashSeed(params.seed);
    const cells = 1 / Math.max(0.02, params.cellSize);
    const dispPx = params.displacement * minDim;
    const softness = Math.max(0.02, params.softness);
    const vertical = params.axis === 'vertical';
    const flowShift = progress * params.flow * cells;
    const sampleA = new Uint8ClampedArray(4);
    const sampleB = new Uint8ClampedArray(4);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const nx = (x / width) * cells + (vertical ? 0 : -flowShift);
        const ny = (y / height) * cells + (vertical ? -flowShift : 0);
        const noise = fractalNoise2D(nx, ny, seed);
        let mixB = clamp01((progress - noise) / softness + 0.5);
        mixB = mixB * mixB * (3 - 2 * mixB);
        const melt = (noise - 0.5) * 2 * (1 - mixB) * dispPx;
        const sx = vertical ? x : x + melt;
        const sy = vertical ? y + melt : y;
        sampleBilinearInto(sampleA, 0, frameA, width, height, sx, sy);
        sampleBilinearInto(sampleB, 0, frameB, width, height, sx, sy);
        const off = (y * width + x) * 4;
        out[off] = mix(sampleA[0], sampleB[0], mixB);
        out[off + 1] = mix(sampleA[1], sampleB[1], mixB);
        out[off + 2] = mix(sampleA[2], sampleB[2], mixB);
        out[off + 3] = 255;
      }
    }
    return out;
  },
});

export default liquidMeltPlugin;
