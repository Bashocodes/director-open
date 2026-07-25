import { z } from 'zod';
import { defineEffectPlugin } from '../types';
import { clamp01, clamp8, luma, smoothstep } from './effectKit';

/**
 * halftone-print — newsprint dots whose size tracks local tone.
 *
 * Each pixel is measured against the centre of the halftone cell it belongs
 * to. Dark areas produce large dots, light areas small ones, which is how a
 * real screen works. The dot lattice is rotated (classically 45°) so the grid
 * does not align with the frame and read as a screen-door artefact.
 *
 * Cell size is a fraction of the short edge, so a still exported at 4096px
 * carries the same number of dots across the frame as the 540px preview — the
 * dots are simply rendered with more precision.
 */
const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(80),
  cellSize: z.number().min(0.004).max(0.06).default(0.014),
  angle: z.number().min(0).max(90).default(45),
  softness: z.number().min(0).max(1).default(0.35),
  colored: z.boolean().default(false),
});

const halftonePrintPlugin = defineEffectPlugin({
  id: 'halftone-print',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Halftone print',
  description: 'Rebuilds the frame from newsprint dots that grow as the tone darkens.',
  order: 28,
  heavy: true,
  textureCritical: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: { control: 'range', label: 'Strength', min: 0, max: 100, step: 1, suffix: '%' },
      cellSize: { control: 'range', label: 'Dot size', min: 0.004, max: 0.06, step: 0.002 },
      angle: { control: 'range', label: 'Screen angle', min: 0, max: 90, step: 1, suffix: '°' },
      softness: { control: 'range', label: 'Dot softness', min: 0, max: 1, step: 0.05 },
      colored: { control: 'toggle', label: 'Keep colour' },
    },
  },
  frameTransform({ sourceRgba, width, height, params }) {
    const out = sourceRgba.slice();
    const gain = params.intensity / 100;
    if (gain <= 0) return out;

    const cell = Math.max(2, params.cellSize * Math.min(width, height));
    const radians = (params.angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    // The largest a dot may grow before neighbours merge into solid ink.
    const maxRadius = cell * 0.707;
    const softness = Math.max(0.001, params.softness);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // Rotate into screen space, find the owning cell, rotate its centre back.
        const u = x * cos + y * sin;
        const v = -x * sin + y * cos;
        const cellU = (Math.floor(u / cell) + 0.5) * cell;
        const cellV = (Math.floor(v / cell) + 0.5) * cell;
        const centerX = cellU * cos - cellV * sin;
        const centerY = cellU * sin + cellV * cos;

        const sampleX = Math.min(width - 1, Math.max(0, Math.round(centerX)));
        const sampleY = Math.min(height - 1, Math.max(0, Math.round(centerY)));
        const s = (sampleY * width + sampleX) * 4;
        const tone = luma(sourceRgba[s], sourceRgba[s + 1], sourceRgba[s + 2]) / 255;

        // Dark tone -> big dot. sqrt because ink coverage grows with area.
        const radius = Math.sqrt(clamp01(1 - tone)) * maxRadius;
        const distance = Math.hypot(x - centerX, y - centerY);
        const edge = maxRadius * softness;
        // 1 inside the dot, 0 outside, with a soft shoulder.
        const ink = 1 - smoothstep(radius - edge, radius + edge, distance);

        const o = (y * width + x) * 4;
        if (params.colored) {
          // Ink carries the cell's own colour; paper stays white.
          for (let c = 0; c < 3; c += 1) {
            const printed = 255 - (255 - sourceRgba[s + c]) * ink;
            out[o + c] = clamp8(sourceRgba[o + c] * (1 - gain) + printed * gain);
          }
        } else {
          const printed = 255 * (1 - ink);
          for (let c = 0; c < 3; c += 1) {
            out[o + c] = clamp8(sourceRgba[o + c] * (1 - gain) + printed * gain);
          }
        }
      }
    }
    return out;
  },
});

export default halftonePrintPlugin;
