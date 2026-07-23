import type { ReelMotion } from '../../../shared/directorSchemas';
import { clamp01 } from './effectRecipes';

export type CameraPose = {
  zoom: number;
  focusX: number;
  focusY: number;
};

function smootherstep(value: number) {
  const amount = clamp01(value);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

/**
 * Shared camera choreography for the Canvas preview. The FFmpeg compiler below
 * uses the same endpoints and easing curve so the downloaded reel follows the
 * composition the editor showed.
 */
export function cameraPoseAt(motion: ReelMotion, progress: number): CameraPose {
  const position = clamp01(progress);
  const eased = smootherstep(position);
  const arc = Math.sin(Math.PI * eased);

  switch (motion) {
    case 'push-in': return { zoom: 1 + 0.14 * eased, focusX: 0.5, focusY: 0.5 };
    case 'pull-out': return { zoom: 1.14 - 0.14 * eased, focusX: 0.5, focusY: 0.5 };
    case 'pan-left': return { zoom: 1.12, focusX: 0.1 + 0.8 * eased, focusY: 0.5 };
    case 'pan-right': return { zoom: 1.12, focusX: 0.9 - 0.8 * eased, focusY: 0.5 };
    case 'pan-up': return { zoom: 1.12, focusX: 0.5, focusY: 0.88 - 0.76 * eased };
    case 'pan-down': return { zoom: 1.12, focusX: 0.5, focusY: 0.12 + 0.76 * eased };
    case 'drift-up-left': return { zoom: 1.12, focusX: 0.86 - 0.72 * eased, focusY: 0.86 - 0.72 * eased };
    case 'drift-down-right': return { zoom: 1.12, focusX: 0.14 + 0.72 * eased, focusY: 0.14 + 0.72 * eased };
    case 'pulse': return { zoom: 1 + 0.065 * Math.sin(Math.PI * eased), focusX: 0.5, focusY: 0.5 };
    case 'hero-push': return { zoom: 1 + 0.16 * eased, focusX: 0.52 - 0.04 * eased, focusY: 0.62 - 0.22 * eased };
    case 'arc-left': return { zoom: 1.14, focusX: 0.88 - 0.76 * eased, focusY: 0.54 - 0.18 * arc };
    case 'arc-right': return { zoom: 1.14, focusX: 0.12 + 0.76 * eased, focusY: 0.54 - 0.18 * arc };
    case 'float': return {
      zoom: 1.08 + 0.035 * (1 - Math.cos(Math.PI * 2 * position)) / 2,
      focusX: 0.5 + 0.16 * Math.sin(Math.PI * 2 * position),
      focusY: 0.5 - 0.1 * Math.sin(Math.PI * 4 * position),
    };
    case 'still':
    default:
      return { zoom: 1, focusX: 0.5, focusY: 0.5 };
  }
}

export type CameraFfmpegExpressions = {
  zoom: string;
  focusX: string;
  focusY: string;
};

/** Compile the same choreography for zoompan's per-frame expression engine. */
export function cameraFfmpegExpressions(motion: ReelMotion, progressFrames: number): CameraFfmpegExpressions {
  const frameMax = Math.max(1, Math.round(progressFrames));
  const position = `(on/${frameMax})`;
  const eased = `(${position}*${position}*${position}*(${position}*(${position}*6-15)+10))`;
  const arc = `sin(PI*${eased})`;

  switch (motion) {
    case 'push-in': return { zoom: `1+0.14*${eased}`, focusX: '0.5', focusY: '0.5' };
    case 'pull-out': return { zoom: `1.14-0.14*${eased}`, focusX: '0.5', focusY: '0.5' };
    case 'pan-left': return { zoom: '1.12', focusX: `0.1+0.8*${eased}`, focusY: '0.5' };
    case 'pan-right': return { zoom: '1.12', focusX: `0.9-0.8*${eased}`, focusY: '0.5' };
    case 'pan-up': return { zoom: '1.12', focusX: '0.5', focusY: `0.88-0.76*${eased}` };
    case 'pan-down': return { zoom: '1.12', focusX: '0.5', focusY: `0.12+0.76*${eased}` };
    case 'drift-up-left': return { zoom: '1.12', focusX: `0.86-0.72*${eased}`, focusY: `0.86-0.72*${eased}` };
    case 'drift-down-right': return { zoom: '1.12', focusX: `0.14+0.72*${eased}`, focusY: `0.14+0.72*${eased}` };
    case 'pulse': return { zoom: `1+0.065*sin(PI*${eased})`, focusX: '0.5', focusY: '0.5' };
    case 'hero-push': return { zoom: `1+0.16*${eased}`, focusX: `0.52-0.04*${eased}`, focusY: `0.62-0.22*${eased}` };
    case 'arc-left': return { zoom: '1.14', focusX: `0.88-0.76*${eased}`, focusY: `0.54-0.18*${arc}` };
    case 'arc-right': return { zoom: '1.14', focusX: `0.12+0.76*${eased}`, focusY: `0.54-0.18*${arc}` };
    case 'float': return {
      zoom: `1.08+0.035*(1-cos(2*PI*${position}))/2`,
      focusX: `0.5+0.16*sin(2*PI*${position})`,
      focusY: `0.5-0.1*sin(4*PI*${position})`,
    };
    case 'still':
    default:
      return { zoom: '1', focusX: '0.5', focusY: '0.5' };
  }
}
