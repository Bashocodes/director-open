import { compileReelTimeline, reelDuration } from '../pages/director/reel/project';
import { reelGradeStack, reelVisualEffectStack, type ReelProject } from '../pages/director/reel/types';
import { reelDimensions } from '../pages/director/reel/catalog';
import {
  DIRECTOR_ADOBE_BEAT_SYNC_DISPLAY_NAME,
  DIRECTOR_ADOBE_BEAT_SYNC_ID,
  DIRECTOR_ADOBE_PIXEL_SORT_DISPLAY_NAME,
  DIRECTOR_ADOBE_PIXEL_SORT_ID,
  DIRECTOR_ADOBE_RENDER_PLAN_VERSION,
  DIRECTOR_ADOBE_WORKING_SPACE,
  parseDirectorAdobeRenderPlan,
  type DirectorAdobeClipPlan,
  type DirectorAdobeMediaEntry,
  type DirectorAdobeRenderPlan,
} from './directorAdobeContract';

export {
  DIRECTOR_ADOBE_RENDER_PLAN_VERSION,
  type DirectorAdobeClipPlan,
  type DirectorAdobeMediaEntry,
  type DirectorAdobeRenderPlan,
} from './directorAdobeContract';

export class DirectorAdobeRenderPlanError extends Error {
  constructor(
    message: string,
    readonly code: 'empty_reel' | 'missing_media' | 'invalid_timeline',
  ) {
    super(message);
    this.name = 'DirectorAdobeRenderPlanError';
  }
}

function fileExtension(name: string) {
  const match = name.match(/\.([a-z0-9]{1,8})$/i);
  return match ? `.${match[1].toLowerCase()}` : '.bin';
}

function safeStem(value: string) {
  return value
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'media';
}

function generatedImageMetadata(url: string, title: string) {
  const match = url.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const encoded = match[2].replace(/\s+/g, '');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const extension = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/webp' ? '.webp' : '.png';
  return {
    originalName: `${safeStem(title)}${extension}`,
    mimeType,
    bytes: Math.max(0, Math.floor(encoded.length * 3 / 4) - padding),
  };
}

function mediaEntryForClip(
  clip: ReelProject['clips'][number],
  index: number,
  allowMissingMedia: boolean,
): DirectorAdobeMediaEntry {
  const generated = generatedImageMetadata(clip.imageUrl, clip.title);
  if (!clip.sourceFile) {
    if (generated) {
      return {
        id: `clip-media-${clip.id}`,
        kind: 'clip',
        relativePath: `media/clip-${String(index + 1).padStart(2, '0')}-${generated.originalName}`,
        ...generated,
        available: true,
      };
    }
    if (allowMissingMedia) {
      const originalName = `${safeStem(clip.title)}.media`;
      return {
        id: `clip-media-${clip.id}`,
        kind: 'clip',
        relativePath: `media/clip-${String(index + 1).padStart(2, '0')}-${originalName}`,
        originalName,
        mimeType: 'application/octet-stream',
        bytes: 0,
        available: false,
      };
    }
    throw new DirectorAdobeRenderPlanError(
      `Clip “${clip.title}” has no local source file for the After Effects handoff.`,
      'missing_media',
    );
  }
  const originalName = clip.sourceFile.name || `${clip.title}.media`;
  return {
    id: `clip-media-${clip.id}`,
    kind: 'clip',
    relativePath: `media/clip-${String(index + 1).padStart(2, '0')}-${safeStem(clip.title)}${fileExtension(originalName)}`,
    originalName,
    mimeType: clip.sourceFile.type || 'application/octet-stream',
    bytes: clip.sourceFile.size,
    available: true,
  };
}

function audioEntryForProject(project: ReelProject): DirectorAdobeMediaEntry | null {
  if (!project.audio) return null;
  return {
    id: 'director-audio',
    kind: 'audio',
    relativePath: `media/audio-${safeStem(project.audio.name)}${fileExtension(project.audio.name)}`,
    originalName: project.audio.name,
    mimeType: project.audio.sourceFile.type || 'application/octet-stream',
    bytes: project.audio.sourceFile.size,
    available: true,
  };
}

export type DirectorAdobeRenderPlanOptions = {
  /** Used by file-only MCP inspection, where browser File objects are omitted by design. */
  allowMissingMedia?: boolean;
};

/**
 * Compile Director's existing timeline into an Adobe-neutral handoff.
 * This is deliberately data-only: it never calls MCP, reads media bytes, or
 * chooses a concrete Adobe tool name. The companion bridge owns execution.
 */
export function buildDirectorAdobeRenderPlan(
  project: ReelProject,
  options: DirectorAdobeRenderPlanOptions = {},
): DirectorAdobeRenderPlan {
  if (project.clips.length === 0) {
    throw new DirectorAdobeRenderPlanError('The reel timeline has no clips.', 'empty_reel');
  }
  const { width, height } = reelDimensions(project.aspectRatio, project.quality);
  const timeline = compileReelTimeline(project);
  const media = project.clips.map((clip, index) => (
    mediaEntryForClip(clip, index, options.allowMissingMedia === true)
  ));
  const audio = audioEntryForProject(project);
  if (audio) media.push(audio);
  const clips = project.clips.map((clip, index) => {
    const timing = timeline.clips[index];
    return {
      clipId: clip.id,
      title: clip.title,
      mediaId: media[index].id,
      startSeconds: timing.start,
      durationSeconds: clip.duration,
      incomingOverlapSeconds: timing.incomingOverlap,
      sourceTimeSeconds: 0,
      gradeStack: reelGradeStack(clip),
      visualEffectStack: reelVisualEffectStack(clip),
      preparedVisualEffectStack: [],
      preparedMotion: false,
      transition: clip.transition,
      transitionDurationSeconds: clip.transitionDuration,
      motion: clip.motion,
      intensity: clip.intensity,
      pluginParams: clip.pluginParams ?? {},
      textLayers: clip.textLayers,
    } satisfies DirectorAdobeClipPlan;
  });
  const durationSeconds = reelDuration(project);
  const compositionName = `${safeStem(project.title)} — Director Adobe`;
  try {
    return parseDirectorAdobeRenderPlan({
      version: DIRECTOR_ADOBE_RENDER_PLAN_VERSION,
      product: 'director-open',
      backend: 'after-effects',
      projectId: project.id,
      title: project.title,
      composition: {
        name: compositionName,
        width,
        height,
        pixelAspect: 1,
        frameRate: project.fps,
        durationSeconds,
        // Director's Adobe master path is always float. Lower values remain in
        // the project schema only for future compatibility renderers.
        bitsPerChannel: 32,
        workingSpace: DIRECTOR_ADOBE_WORKING_SPACE,
      },
      output: {
        container: 'mov',
        codec: 'prores-4444',
        bitDepth: 12,
        colorSpace: 'Rec.2100 HLG',
        filename: `${safeStem(project.title)}-director-adobe.mov`,
        outputModuleTemplateCandidates: [
          'Apple ProRes 4444',
          'ProRes 4444',
          'Apple ProRes 4444 with Alpha',
        ],
        fallbackOutputModuleProfiles: [{
          codec: 'prores-422-intermediate',
          bitDepth: 10,
          colorSpace: 'Rec.2100 HLG',
          postProcess: 'hevc-main10-hlg',
          // This is Conductor's existing Adobe intermediate. Director verifies
          // and converts it to a tagged HEVC Main 10 HLG delivery because the
          // template name alone is not treated as proof of final HDR metadata.
          outputModuleTemplateCandidates: ['IG HDR HLG ProRes'],
        }],
      },
      timeline: {
        clips,
        beats: {
          enabled: Boolean(audio),
          source: 'native-audio-amplitude',
          markerLayerName: 'Director Beat Map',
          threshold: 10,
          riseRatio: 1.12,
          minimumGapSeconds: 0.125,
          pulseDurationSeconds: 0.08,
        },
      },
      media,
      effectContracts: {
        pixelSort: {
          id: DIRECTOR_ADOBE_PIXEL_SORT_ID,
          displayName: DIRECTOR_ADOBE_PIXEL_SORT_DISPLAY_NAME,
          beatAmountParameter: 'Beat Amount',
        },
        beatSync: {
          id: DIRECTOR_ADOBE_BEAT_SYNC_ID,
          displayName: DIRECTOR_ADOBE_BEAT_SYNC_DISPLAY_NAME,
        },
      },
    });
  } catch {
    throw new DirectorAdobeRenderPlanError(
      'The reel timeline is outside the supported Adobe handoff limits.',
      'invalid_timeline',
    );
  }
}
