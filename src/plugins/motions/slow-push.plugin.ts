import { z } from 'zod';
import { defineMotionPlugin } from '../types';

const ParamsSchema = z.object({});

function smootherstep(value: number) {
  const v = Math.min(1, Math.max(0, value));
  return v * v * v * (v * (v * 6 - 15) + 10);
}

/** Very gentle centered push. Eased in both preview pose and ffmpeg zoompan. */
const slowPushPlugin = defineMotionPlugin({
  id: 'slow-push',
  kind: 'motion',
  displayName: 'Slow push',
  description: 'A barely-there eased push toward center.',
  order: 20,
  params: { schema: ParamsSchema, ui: {} },
  cameraPose({ progress }) {
    return { zoom: 1 + 0.08 * smootherstep(progress), focusX: 0.5, focusY: 0.5 };
  },
  ffmpegExpressions({ progressFrames }) {
    const frameMax = Math.max(1, Math.round(progressFrames));
    const pos = `(on/${frameMax})`;
    const eased = `(${pos}*${pos}*${pos}*(${pos}*(${pos}*6-15)+10))`;
    return { zoom: `1+0.08*${eased}`, focusX: '0.5', focusY: '0.5' };
  },
});

export default slowPushPlugin;
