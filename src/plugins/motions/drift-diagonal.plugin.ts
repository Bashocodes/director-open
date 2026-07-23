import { z } from 'zod';
import { defineMotionPlugin } from '../types';

const ParamsSchema = z.object({});

function smootherstep(value: number) {
  const v = Math.min(1, Math.max(0, value));
  return v * v * v * (v * (v * 6 - 15) + 10);
}

/** A slow eased diagonal float with a light push. */
const driftDiagonalPlugin = defineMotionPlugin({
  id: 'drift-diagonal',
  kind: 'motion',
  displayName: 'Drift diagonal',
  description: 'A slow eased diagonal glide with a gentle push.',
  order: 22,
  params: { schema: ParamsSchema, ui: {} },
  cameraPose({ progress }) {
    const eased = smootherstep(progress);
    return {
      zoom: 1.06 + 0.04 * eased,
      focusX: 0.34 + 0.32 * eased,
      focusY: 0.4 + 0.2 * eased,
    };
  },
  ffmpegExpressions({ progressFrames }) {
    const frameMax = Math.max(1, Math.round(progressFrames));
    const pos = `(on/${frameMax})`;
    const eased = `(${pos}*${pos}*${pos}*(${pos}*(${pos}*6-15)+10))`;
    return {
      zoom: `1.06+0.04*${eased}`,
      focusX: `0.34+0.32*${eased}`,
      focusY: `0.4+0.2*${eased}`,
    };
  },
});

export default driftDiagonalPlugin;
