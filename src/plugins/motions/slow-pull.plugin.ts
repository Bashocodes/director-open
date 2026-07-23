import { z } from 'zod';
import { defineMotionPlugin } from '../types';

const ParamsSchema = z.object({});

function smootherstep(value: number) {
  const v = Math.min(1, Math.max(0, value));
  return v * v * v * (v * (v * 6 - 15) + 10);
}

/** Gentle eased pull-out from a slight push-in start. */
const slowPullPlugin = defineMotionPlugin({
  id: 'slow-pull',
  kind: 'motion',
  displayName: 'Slow pull',
  description: 'A slow eased pull back that opens the frame.',
  order: 21,
  params: { schema: ParamsSchema, ui: {} },
  cameraPose({ progress }) {
    return { zoom: 1.12 - 0.12 * smootherstep(progress), focusX: 0.5, focusY: 0.5 };
  },
  ffmpegExpressions({ progressFrames }) {
    const frameMax = Math.max(1, Math.round(progressFrames));
    const pos = `(on/${frameMax})`;
    const eased = `(${pos}*${pos}*${pos}*(${pos}*(${pos}*6-15)+10))`;
    return { zoom: `1.12-0.12*${eased}`, focusX: '0.5', focusY: '0.5' };
  },
});

export default slowPullPlugin;
