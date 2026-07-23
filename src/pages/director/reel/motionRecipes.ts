import {
  pluginRegistry,
  safePluginParams,
} from '../../../plugins/registry';
import type {
  CameraFfmpegExpressions,
  CameraPose,
} from '../../../plugins/types';

export type { CameraFfmpegExpressions, CameraPose };

function motionPlugin(id: string) {
  return pluginRegistry.getMotion(id) ?? pluginRegistry.getMotion('still');
}

/** Shared registry dispatch for Canvas preview choreography. */
export function cameraPoseAt(
  motion: string,
  progress: number,
  params: Readonly<Record<string, unknown>> = {},
): CameraPose {
  const plugin = motionPlugin(motion);
  if (!plugin) return { zoom: 1, focusX: 0.5, focusY: 0.5 };
  return plugin.cameraPose({
    progress,
    params: safePluginParams(plugin, params),
  });
}

/** Shared registry dispatch for FFmpeg zoompan expressions. */
export function cameraFfmpegExpressions(
  motion: string,
  progressFrames: number,
  params: Readonly<Record<string, unknown>> = {},
): CameraFfmpegExpressions {
  const plugin = motionPlugin(motion);
  if (!plugin) return { zoom: '1', focusX: '0.5', focusY: '0.5' };
  return plugin.ffmpegExpressions({
    progressFrames,
    params: safePluginParams(plugin, params),
  });
}
