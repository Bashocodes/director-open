import { z } from 'zod';
import { defineEffectPlugin } from '../types';
import { boxBlurRgb, clamp01, clamp8, luma, screenBlend } from './effectKit';

/**
 * neon-edge — contours lifted off the frame and lit like tubing.
 *
 * A Sobel gradient gives edge magnitude, which is tinted, blurred to give the
 * glow its halo, and screened back over a darkened version of the source. The
 * darkening is what sells it: neon reads as neon only when the surrounding
 * frame has fallen away.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(65),
  hue: z.number().min(0).max(360).default(315),
  glow: z.number().min(0).max(0.05).default(0.012),
  threshold: z.number().min(0).max(100).default(12),
  darken: z.number().min(0).max(100).default(55),
});

const neonEdgePlugin = defineEffectPlugin({
  id: 'neon-edge',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Neon edge',
  description: 'Traces contours in glowing tubing and drops the rest of the frame back.',
  order: 27,
  heavy: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      hue: { control: 'range', label: 'Hue', min: 0, max: 360, step: 1, suffix: '°' },
      glow: { control: 'range', label: 'Glow radius', min: 0, max: 0.05, step: 0.002 },
      threshold: { control: 'range', label: 'Edge threshold', min: 0, max: 100, step: 1, suffix: '%' },
      darken: { control: 'range', label: 'Drop background', min: 0, max: 100, step: 1, suffix: '%' },
    },
  },
  frameTransform({ sourceRgba, width, height, params }) {
    const out = sourceRgba.slice();
    const gain = params.intensity / 100;
    if (gain <= 0) return out;

    const pixels = width * height;
    const gray = new Float32Array(pixels);
    for (let p = 0; p < pixels; p += 1) {
      const o = p * 4;
      gray[p] = luma(sourceRgba[o], sourceRgba[o + 1], sourceRgba[o + 2]);
    }

    const [tintR, tintG, tintB] = hueToRgb(params.hue);
    const threshold = (params.threshold / 100) * 255;
    const edges = new Float32Array(pixels * 3);

    for (let y = 0; y < height; y += 1) {
      const yUp = y > 0 ? y - 1 : 0;
      const yDown = y < height - 1 ? y + 1 : height - 1;
      for (let x = 0; x < width; x += 1) {
        const xLeft = x > 0 ? x - 1 : 0;
        const xRight = x < width - 1 ? x + 1 : width - 1;
        const tl = gray[yUp * width + xLeft];
        const tc = gray[yUp * width + x];
        const tr = gray[yUp * width + xRight];
        const ml = gray[y * width + xLeft];
        const mr = gray[y * width + xRight];
        const bl = gray[yDown * width + xLeft];
        const bc = gray[yDown * width + x];
        const br = gray[yDown * width + xRight];
        const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
        const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
        const magnitude = Math.hypot(gx, gy) / 4;
        if (magnitude <= threshold) continue;
        const strength = clamp01((magnitude - threshold) / 255) * 255;
        const b = (y * width + x) * 3;
        edges[b] = strength * tintR;
        edges[b + 1] = strength * tintG;
        edges[b + 2] = strength * tintB;
      }
    }

    const radius = Math.max(0, Math.round(params.glow * Math.min(width, height)));
    const halo = radius > 0 ? boxBlurRgb(edges, width, height, radius, radius) : edges;
    // A box blur spreads the edge energy thin; restore it so the halo reads.
    const restore = radius > 0 ? Math.sqrt(radius * 2 + 1) : 1;
    const keep = clamp01(1 - (params.darken / 100) * gain);

    for (let p = 0; p < pixels; p += 1) {
      const o = p * 4;
      const b = p * 3;
      const baseR = sourceRgba[o] * keep;
      const baseG = sourceRgba[o + 1] * keep;
      const baseB = sourceRgba[o + 2] * keep;
      // The core edge stays crisp on top of its own halo.
      out[o] = clamp8(screenBlend(baseR, halo[b] * restore * gain) + edges[b] * gain * 0.5);
      out[o + 1] = clamp8(screenBlend(baseG, halo[b + 1] * restore * gain) + edges[b + 1] * gain * 0.5);
      out[o + 2] = clamp8(screenBlend(baseB, halo[b + 2] * restore * gain) + edges[b + 2] * gain * 0.5);
    }
    return out;
  },
});

/** Fully saturated RGB for a hue in degrees, each channel 0..1. */
function hueToRgb(hue: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360 / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  if (h < 1) return [1, x, 0];
  if (h < 2) return [x, 1, 0];
  if (h < 3) return [0, 1, x];
  if (h < 4) return [0, x, 1];
  if (h < 5) return [x, 0, 1];
  return [1, 0, x];
}

export default neonEdgePlugin;
