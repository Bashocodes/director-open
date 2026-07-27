import { BrowserFfmpegRenderer, type RenderCallbacks } from './ffmpegRenderer';
import {
  buildDirectorAdobeHandoff,
  type DirectorAdobeHandoff,
  type DirectorPreparedClipPlate,
} from './adobeHandoff';
import {
  reelVisualEffectStack,
  type ReelClip,
  type ReelProject,
} from './types';

export type AdobeEffectPlateCallbacks = {
  onStage: (message: string) => void;
  onProgress: (progress: number) => void;
  onLog?: (message: string) => void;
};

export type AdobeEffectPlateRenderer = (
  project: ReelProject,
  callbacks: RenderCallbacks,
) => Promise<Blob>;

export function directorAdobePlateProject(
  project: ReelProject,
  clip: ReelClip,
): ReelProject {
  const visualEffectStack = reelVisualEffectStack(clip);
  return {
    ...project,
    id: `${project.id}-adobe-plate-${clip.id}`,
    title: `${clip.title} — Director exact Adobe plate`,
    clips: [{
      ...clip,
      effect: 'clean',
      gradeStack: ['clean'],
      visualEffect: visualEffectStack[0] ?? 'none',
      visualEffectStack,
      transition: 'cut',
      transitionDuration: 0,
      textLayers: [],
    }],
    selectedClipIds: [clip.id],
    audio: null,
    renderBackend: 'ffmpeg',
    renderRequested: false,
  };
}

async function defaultRenderPlate(
  project: ReelProject,
  callbacks: RenderCallbacks,
) {
  const renderer = new BrowserFfmpegRenderer();
  try {
    return await renderer.render(project, callbacks);
  } finally {
    renderer.cancel();
  }
}

/**
 * Bakes every selected visual-effect stack with the same frame engine used by
 * Director's preview/FFmpeg renderer. After Effects receives the full-frame
 * plate and therefore cannot replace Pixel Sort (or any other selected visual
 * effect) with a merely similar built-in Adobe effect.
 */
export async function prepareDirectorAdobeHandoff(
  project: ReelProject,
  callbacks: AdobeEffectPlateCallbacks,
  renderPlate: AdobeEffectPlateRenderer = defaultRenderPlate,
): Promise<DirectorAdobeHandoff> {
  const clips = project.clips.filter((clip) => reelVisualEffectStack(clip).length > 0);
  if (clips.length === 0) return buildDirectorAdobeHandoff(project);

  const plates: DirectorPreparedClipPlate[] = [];
  for (const [index, clip] of clips.entries()) {
    const ordinal = `${index + 1}/${clips.length}`;
    const plate = await renderPlate(
      directorAdobePlateProject(project, clip),
      {
        onStage: (_stage, message) => callbacks.onStage(
          `Preparing exact Adobe effect plate ${ordinal} · ${message}`,
        ),
        onProgress: (progress) => callbacks.onProgress(
          (index + Math.max(0, Math.min(1, progress))) / clips.length,
        ),
        onLog: callbacks.onLog,
      },
    );
    if (plate.size === 0) {
      throw new Error(`Director’s exact effect plate for “${clip.title}” was empty.`);
    }
    plates.push({ clipId: clip.id, data: plate });
  }
  callbacks.onProgress(1);
  return buildDirectorAdobeHandoff(project, plates);
}
