import { z } from 'zod';
import { defineMotionPlugin } from '../types';

/**
 * A short eased shake BURST placed at a configurable progress point — never a
 * constant baseline shake. A gaussian envelope around the apex times the shake,
 * so it is ~0 at the clip's start and end. The same envelope + oscillation is
 * expressed for both the preview pose and the ffmpeg zoompan.
 */
const ParamsSchema = z.object({
  apex: z.number().min(0).max(1).default(0.5),
  amplitude: z.number().min(0).max(0.08).default(0.03),
  width: z.number().min(0.03).max(0.4).default(0.12),
  frequency: z.number().min(6).max(28).default(16),
});

const apexShakePlugin = defineMotionPlugin({
  id: 'apex-shake',
  kind: 'motion',
  displayName: 'Apex shake',
  description: 'A short eased shake burst at a chosen point — quiet at the ends.',
  order: 24,
  params: {
    schema: ParamsSchema,
    ui: {
      apex: { control: 'range', label: 'Apex', min: 0, max: 1, step: 0.02 },
      amplitude: { control: 'range', label: 'Amplitude', min: 0, max: 0.08, step: 0.005 },
      width: { control: 'range', label: 'Burst width', min: 0.03, max: 0.4, step: 0.01 },
      frequency: { control: 'range', label: 'Frequency', min: 6, max: 28, step: 1 },
    },
  },
  cameraPose({ progress, params }) {
    const delta = (progress - params.apex) / params.width;
    const envelope = Math.exp(-(delta * delta));
    const phase = progress * params.frequency * Math.PI * 2;
    return {
      zoom: 1.06,
      focusX: 0.5 + params.amplitude * envelope * Math.sin(phase),
      focusY: 0.5 + params.amplitude * envelope * Math.cos(phase),
    };
  },
  ffmpegExpressions({ progressFrames, params }) {
    const frameMax = Math.max(1, Math.round(progressFrames));
    const pos = `(on/${frameMax})`;
    const delta = `((${pos}-${params.apex})/${params.width})`;
    const envelope = `exp(-(${delta}*${delta}))`;
    const phase = `(${pos}*${params.frequency}*2*PI)`;
    return {
      zoom: '1.06',
      focusX: `0.5+${params.amplitude}*${envelope}*sin(${phase})`,
      focusY: `0.5+${params.amplitude}*${envelope}*cos(${phase})`,
    };
  },
});

export default apexShakePlugin;
