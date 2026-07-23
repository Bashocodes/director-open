import { z } from 'zod';
import { defineMotionPlugin } from '../types';

const ParamsSchema = z.object({});

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smootherstep(value: number) {
  const amount = clamp01(value);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

const pushInPlugin = defineMotionPlugin({
  id: 'push-in',
  kind: 'motion',
  displayName: 'Push in',
  description: 'Slow, centered scale toward the subject.',
  order: 1,
  params: { schema: ParamsSchema, ui: {} },
  cameraPose({ progress }) {
    return {
      zoom: 1 + 0.14 * smootherstep(progress),
      focusX: 0.5,
      focusY: 0.5,
    };
  },
  ffmpegExpressions({ progressFrames }) {
    const frameMax = Math.max(1, Math.round(progressFrames));
    const position = `(on/${frameMax})`;
    const eased = `(${position}*${position}*${position}*(${position}*(${position}*6-15)+10))`;
    return { zoom: `1+0.14*${eased}`, focusX: '0.5', focusY: '0.5' };
  },
});

export default pushInPlugin;
