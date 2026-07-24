import { z } from 'zod';
import { defineEffectPlugin } from '../types';

/**
 * halation-bloom — a threshold glow on highlights. Highlights above a luma
 * threshold are extracted, separable-box-blurred (a textbook approximation of a
 * gaussian), and screened back over the frame. Radius is normalized to the
 * frame's short edge. Pre-motion frameTransform → identical preview and export.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(55),
  radius: z.number().min(0.005).max(0.08).default(0.022),
  threshold: z.number().min(0).max(100).default(66),
});

const halationBloomPlugin = defineEffectPlugin({
  id: 'halation-bloom',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Halation bloom',
  description: 'Soft glow blooming from the brightest highlights.',
  order: 21,
  heavy: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      radius: { control: 'range', label: 'Radius', min: 0.005, max: 0.08, step: 0.002 },
      threshold: { control: 'range', label: 'Threshold', min: 0, max: 100, step: 1, suffix: '%' },
    },
  },
  frameTransform({ sourceRgba, width, height, params }) {
    const out = sourceRgba.slice();
    const gain = params.intensity / 100;
    if (gain <= 0) return out;
    const threshold = (params.threshold / 100) * 255;
    const pixelCount = width * height;
    // Extract highlights (amount above threshold) per channel.
    const highlight = new Float32Array(pixelCount * 3);
    for (let p = 0; p < pixelCount; p += 1) {
      const o = p * 4;
      const luma = sourceRgba[o] * 0.3 + sourceRgba[o + 1] * 0.6 + sourceRgba[o + 2] * 0.1;
      if (luma <= threshold) continue;
      const scale = (luma - threshold) / Math.max(1, 255 - threshold);
      highlight[p * 3] = sourceRgba[o] * scale;
      highlight[p * 3 + 1] = sourceRgba[o + 1] * scale;
      highlight[p * 3 + 2] = sourceRgba[o + 2] * scale;
    }

    const radiusPx = Math.max(1, Math.round(params.radius * Math.min(width, height)));
    const temp = new Float32Array(pixelCount * 3);
    const blurred = new Float32Array(pixelCount * 3);
    boxBlurHorizontal(highlight, temp, width, height, radiusPx);
    boxBlurVertical(temp, blurred, width, height, radiusPx);

    for (let p = 0; p < pixelCount; p += 1) {
      const o = p * 4;
      const b = p * 3;
      // Screen the bloom back over the source.
      out[o] = screen(sourceRgba[o], blurred[b] * gain);
      out[o + 1] = screen(sourceRgba[o + 1], blurred[b + 1] * gain);
      out[o + 2] = screen(sourceRgba[o + 2], blurred[b + 2] * gain);
    }
    return out;
  },
});

function screen(base: number, add: number): number {
  const a = add < 0 ? 0 : add > 255 ? 255 : add;
  return 255 - ((255 - base) * (255 - a)) / 255;
}

function boxBlurHorizontal(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number): void {
  const window = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let x = -radius; x <= radius; x += 1) {
        const cx = Math.min(width - 1, Math.max(0, x));
        sum += src[(row + cx) * 3 + c];
      }
      for (let x = 0; x < width; x += 1) {
        dst[(row + x) * 3 + c] = sum / window;
        const outX = Math.min(width - 1, Math.max(0, x - radius));
        const inX = Math.min(width - 1, Math.max(0, x + radius + 1));
        sum += src[(row + inX) * 3 + c] - src[(row + outX) * 3 + c];
      }
    }
  }
}

function boxBlurVertical(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number): void {
  const window = radius * 2 + 1;
  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0;
      for (let y = -radius; y <= radius; y += 1) {
        const cy = Math.min(height - 1, Math.max(0, y));
        sum += src[(cy * width + x) * 3 + c];
      }
      for (let y = 0; y < height; y += 1) {
        dst[(y * width + x) * 3 + c] = sum / window;
        const outY = Math.min(height - 1, Math.max(0, y - radius));
        const inY = Math.min(height - 1, Math.max(0, y + radius + 1));
        sum += src[(inY * width + x) * 3 + c] - src[(outY * width + x) * 3 + c];
      }
    }
  }
}

export default halationBloomPlugin;
