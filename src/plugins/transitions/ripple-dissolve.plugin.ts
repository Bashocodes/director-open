import { z } from 'zod';
import { defineTransitionPlugin } from '../types';
import { EASING_CURVES, EASING_UI_OPTIONS, clamp01 } from '../easing';
import { mix, sampleBilinearInto } from './transitionKit';

/**
 * ripple-dissolve — the flagship. A radial sine wave expands from a configurable
 * origin; near the moving front the image is displaced along the radius (a water
 * ring), and a soft mixing front carries frame A into frame B behind it.
 *
 * Original first-principles implementation of textbook radial displacement
 * mapping — no ported shader code. Every spatial quantity is a fraction of the
 * frame, so 540-wide preview and 1080-wide export are the same wave.
 */
const ParamsSchema = z.object({
  duration: z.number().min(0.1).max(3).default(0.9),
  easing: z.enum(EASING_CURVES).default('ease-in-out'),
  originX: z.number().min(0).max(1).default(0.5),
  originY: z.number().min(0).max(1).default(0.5),
  wavelength: z.number().min(0.02).max(0.5).default(0.14),
  amplitude: z.number().min(0).max(0.25).default(0.06),
  damping: z.number().min(0).max(1).default(0.4),
  softness: z.number().min(0.02).max(0.6).default(0.16),
});

const rippleDissolvePlugin = defineTransitionPlugin({
  id: 'ripple-dissolve',
  kind: 'transition',
  displayName: 'Ripple dissolve',
  description: 'A liquid ring expands from a point, rippling A into B behind a soft front.',
  order: 20,
  previewQuality: 'full',
  params: {
    schema: ParamsSchema,
    ui: {
      duration: { control: 'number', label: 'Duration', min: 0.1, max: 3, step: 0.05 },
      easing: { control: 'select', label: 'Easing', options: EASING_UI_OPTIONS },
      originX: { control: 'range', label: 'Origin X', min: 0, max: 1, step: 0.01 },
      originY: { control: 'range', label: 'Origin Y', min: 0, max: 1, step: 0.01 },
      wavelength: { control: 'range', label: 'Wavelength', min: 0.02, max: 0.5, step: 0.01 },
      amplitude: { control: 'range', label: 'Amplitude', min: 0, max: 0.25, step: 0.005 },
      damping: { control: 'range', label: 'Damping', min: 0, max: 1, step: 0.02 },
      softness: { control: 'range', label: 'Front softness', min: 0.02, max: 0.6, step: 0.01 },
    },
  },
  // Affine fallbacks (used only if the per-pixel path is unavailable; the export
  // overlay hides the xfade base entirely when renderFrame runs).
  preview: ({ progress }) => ({ opacity: clamp01(progress), translateX: 0, translateY: 0, scale: 1 }),
  ffmpegTransition: () => 'fade',
  renderFrame({ frameA, frameB, progress, width, height, params }) {
    const out = new Uint8ClampedArray(frameA.length);
    const originX = params.originX * width;
    const originY = params.originY * height;
    const maxRadius = Math.max(1, Math.hypot(
      Math.max(originX, width - originX),
      Math.max(originY, height - originY),
    ));
    const minDim = Math.min(width, height);
    const amplitudePx = params.amplitude * minDim;
    const wavelength = Math.max(0.01, params.wavelength);
    const softness = Math.max(0.02, params.softness);
    const damping = clamp01(1 - params.damping);
    const sampleA = new Uint8ClampedArray(4);
    const sampleB = new Uint8ClampedArray(4);
    const twoPi = Math.PI * 2;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = x - originX;
        const dy = y - originY;
        const dist = Math.hypot(dx, dy);
        const distNorm = dist / maxRadius;
        const signed = distNorm - progress;

        // Soft front: inside the ring (signed < 0) shows B, outside shows A.
        let mixB = clamp01(0.5 - signed / (2 * softness));
        mixB = mixB * mixB * (3 - 2 * mixB);

        // Displacement concentrated at the expanding front (a gaussian ring),
        // attenuated with distance by damping.
        const frontEnvelope = Math.exp(-(signed * signed) / (2 * softness * softness));
        const attenuation = Math.pow(damping, distNorm);
        const wave = Math.sin((distNorm / wavelength - progress) * twoPi);
        const amp = wave * amplitudePx * frontEnvelope * attenuation;
        const invDist = dist > 1e-4 ? 1 / dist : 0;
        const sx = x + dx * invDist * amp;
        const sy = y + dy * invDist * amp;

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

export default rippleDissolvePlugin;
