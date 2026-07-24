import { z } from 'zod';
import { defineTransitionPlugin } from '../types';
import { EASING_CURVES, EASING_UI_OPTIONS, clamp01 } from '../easing';
import { hashSeed, mix, mulberry32, sampleBilinearInto } from './transitionKit';

/**
 * glitch-cut — a few discrete glitched frames (RGB channel splits + horizontal
 * slice offsets) built from a SEEDED deterministic RNG so the same seed yields
 * the same frames and golden tests stay stable. Progress is quantized into steps.
 *
 * Engine easing defaults to 'linear' on purpose: progress is quantized into
 * discrete glitch steps, so a continuous engine ease would be meaningless.
 */
const ParamsSchema = z.object({
  duration: z.number().min(0.1).max(1).default(0.3),
  easing: z.enum(EASING_CURVES).default('linear'),
  steps: z.number().int().min(3).max(6).default(5),
  slices: z.number().int().min(2).max(24).default(10),
  maxOffset: z.number().min(0).max(0.2).default(0.06),
  rgbSplit: z.number().min(0).max(0.05).default(0.012),
  seed: z.number().int().min(0).max(9999).default(7),
});

const glitchCutPlugin = defineTransitionPlugin({
  id: 'glitch-cut',
  kind: 'transition',
  displayName: 'Glitch cut',
  description: 'A few seeded glitch frames — RGB splits and slice offsets — snap A to B.',
  order: 26,
  previewQuality: 'full',
  params: {
    schema: ParamsSchema,
    ui: {
      duration: { control: 'number', label: 'Duration', min: 0.1, max: 1, step: 0.05 },
      easing: { control: 'select', label: 'Easing', options: EASING_UI_OPTIONS },
      steps: { control: 'range', label: 'Glitch frames', min: 3, max: 6, step: 1 },
      slices: { control: 'range', label: 'Slices', min: 2, max: 24, step: 1 },
      maxOffset: { control: 'range', label: 'Slice offset', min: 0, max: 0.2, step: 0.005 },
      rgbSplit: { control: 'range', label: 'RGB split', min: 0, max: 0.05, step: 0.002 },
    },
  },
  preview: ({ progress }) => ({ opacity: progress < 0.5 ? 0 : 1, translateX: 0, translateY: 0, scale: 1 }),
  ffmpegTransition: () => 'fade',
  renderFrame({ frameA, frameB, progress, width, height, params }) {
    const out = new Uint8ClampedArray(frameA.length);
    const steps = Math.max(1, Math.round(params.steps));
    const step = Math.min(steps - 1, Math.max(0, Math.floor(progress * steps)));
    // Seed strictly from (seed, step) so 0.25/0.5/0.75 map to stable frames.
    const rng = mulberry32(hashSeed(params.seed, step));
    const slices = Math.max(1, Math.round(params.slices));
    const offsets = Array.from({ length: slices }, () => (rng() * 2 - 1) * params.maxOffset * width);
    const split = params.rgbSplit * width * (0.5 + rng());
    const baseMix = clamp01(step / Math.max(1, steps - 1));
    const smooth = baseMix * baseMix * (3 - 2 * baseMix);
    const rgbaA = new Uint8ClampedArray(4);
    const rgbaB = new Uint8ClampedArray(4);
    const sampleChannel = (frame: Uint8ClampedArray, buffer: Uint8ClampedArray, x: number, y: number) => {
      sampleBilinearInto(buffer, 0, frame, width, height, x, y);
    };

    for (let y = 0; y < height; y += 1) {
      const band = Math.min(slices - 1, Math.floor((y / height) * slices));
      const offset = offsets[band];
      for (let x = 0; x < width; x += 1) {
        const off = (y * width + x) * 4;
        // Red shifted +split, blue shifted -split; green centered.
        sampleChannel(frameA, rgbaA, x + offset + split, y); sampleChannel(frameB, rgbaB, x + offset + split, y);
        const r = mix(rgbaA[0], rgbaB[0], smooth);
        sampleChannel(frameA, rgbaA, x + offset, y); sampleChannel(frameB, rgbaB, x + offset, y);
        const g = mix(rgbaA[1], rgbaB[1], smooth);
        sampleChannel(frameA, rgbaA, x + offset - split, y); sampleChannel(frameB, rgbaB, x + offset - split, y);
        const b = mix(rgbaA[2], rgbaB[2], smooth);
        out[off] = r;
        out[off + 1] = g;
        out[off + 2] = b;
        out[off + 3] = 255;
      }
    }
    void height;
    return out;
  },
});

export default glitchCutPlugin;
