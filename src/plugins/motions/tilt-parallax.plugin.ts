import { z } from 'zod';
import { defineMotionPlugin } from '../types';

const ParamsSchema = z.object({});

function smootherstep(value: number) {
  const v = Math.min(1, Math.max(0, value));
  return v * v * v * (v * (v * 6 - 15) + 10);
}

/**
 * Subtle scale + counter-translate for a parallax tilt. The frame scales up
 * slightly while the focus counter-moves, reading as depth. Eased throughout.
 */
const tiltParallaxPlugin = defineMotionPlugin({
  id: 'tilt-parallax',
  kind: 'motion',
  displayName: 'Tilt parallax',
  description: 'A subtle scale and counter-motion that fakes shallow depth.',
  order: 23,
  params: { schema: ParamsSchema, ui: {} },
  cameraPose({ progress }) {
    const eased = smootherstep(progress);
    return {
      zoom: 1.05 + 0.03 * eased,
      focusX: 0.5 + 0.07 * (eased - 0.5),
      focusY: 0.5 - 0.05 * (eased - 0.5),
    };
  },
  ffmpegExpressions({ progressFrames }) {
    const frameMax = Math.max(1, Math.round(progressFrames));
    const pos = `(on/${frameMax})`;
    const eased = `(${pos}*${pos}*${pos}*(${pos}*(${pos}*6-15)+10))`;
    return {
      zoom: `1.05+0.03*${eased}`,
      focusX: `0.5+0.07*(${eased}-0.5)`,
      focusY: `0.5-0.05*(${eased}-0.5)`,
    };
  },
});

export default tiltParallaxPlugin;
