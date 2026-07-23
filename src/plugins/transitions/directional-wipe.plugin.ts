import { z } from 'zod';
import { defineTransitionPlugin } from '../types';
import { EASING_CURVES, EASING_UI_OPTIONS, clamp01 } from '../easing';
import { mix } from './transitionKit';

/**
 * directional-wipe — a hard/soft edge sweeps across the frame at an arbitrary
 * angle, optionally with a bright edge-glow line. Textbook projected-gradient
 * wipe; the wipe position and softness are normalized to the frame.
 */
const ParamsSchema = z.object({
  duration: z.number().min(0.1).max(3).default(0.7),
  easing: z.enum(EASING_CURVES).default('ease-in-out'),
  angle: z.number().min(0).max(360).default(0),
  softness: z.number().min(0).max(0.4).default(0.08),
  edgeGlow: z.number().min(0).max(1).default(0.35),
});

const directionalWipePlugin = defineTransitionPlugin({
  id: 'directional-wipe',
  kind: 'transition',
  displayName: 'Directional wipe',
  description: 'A soft edge sweeps B in across an arbitrary angle, with an optional glow line.',
  order: 22,
  previewQuality: 'full',
  params: {
    schema: ParamsSchema,
    ui: {
      duration: { control: 'number', label: 'Duration', min: 0.1, max: 3, step: 0.05 },
      easing: { control: 'select', label: 'Easing', options: EASING_UI_OPTIONS },
      angle: { control: 'range', label: 'Angle', min: 0, max: 360, step: 1, suffix: '°' },
      softness: { control: 'range', label: 'Edge softness', min: 0, max: 0.4, step: 0.01 },
      edgeGlow: { control: 'range', label: 'Edge glow', min: 0, max: 1, step: 0.02 },
    },
  },
  preview: ({ progress }) => ({ opacity: clamp01(progress), translateX: 0, translateY: 0, scale: 1 }),
  ffmpegTransition: () => 'wipeleft',
  renderFrame({ frameA, frameB, progress, width, height, params }) {
    const out = new Uint8ClampedArray(frameA.length);
    const radians = (params.angle * Math.PI) / 180;
    const dirX = Math.cos(radians);
    const dirY = Math.sin(radians);
    // Normalize the projection so pNorm spans [0,1] across the frame.
    const projected = [
      0, dirX * width, dirY * height, dirX * width + dirY * height,
    ];
    const projMin = Math.min(...projected);
    const projRange = Math.max(1e-4, Math.max(...projected) - projMin);
    const softness = Math.max(1e-4, params.softness);
    const glowWidth = Math.max(0.02, params.softness);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pNorm = (x * dirX + y * dirY - projMin) / projRange;
        let mixB = clamp01((progress - pNorm) / softness + 0.5);
        mixB = mixB * mixB * (3 - 2 * mixB);
        const off = (y * width + x) * 4;
        let r = mix(frameA[off], frameB[off], mixB);
        let g = mix(frameA[off + 1], frameB[off + 1], mixB);
        let b = mix(frameA[off + 2], frameB[off + 2], mixB);
        if (params.edgeGlow > 0) {
          const edge = Math.abs(pNorm - progress) / glowWidth;
          const glow = params.edgeGlow * Math.exp(-(edge * edge)) * 255;
          r += glow; g += glow; b += glow;
        }
        out[off] = r;
        out[off + 1] = g;
        out[off + 2] = b;
        out[off + 3] = 255;
      }
    }
    return out;
  },
});

export default directionalWipePlugin;
