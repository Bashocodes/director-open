import {
  buildFfmpegCommand,
  type FfmpegCommandPlan,
  type TextLayerCommandInput,
} from '../pages/director/reel/ffmpegRenderer';
import { reelVisualEffectStack } from '../pages/director/reel/types';
import { structuralEffectIds } from '../pages/director/reel/structuralEffects';
import {
  parseDirectorProjectFile,
  type DirectorProjectFile,
} from './directorProject';

export type HeadlessRenderPlanInputs = {
  images: Array<{
    inputIndex: number;
    clipId: string;
    name: string;
  }>;
  structuralEffects: Array<{
    inputIndex: number;
    clipId: string;
    effects: string[];
    pattern: string;
  }>;
  textLayers: Array<{
    inputIndex: number;
    clipId: string;
    layerId: string;
    name: string;
  }>;
  audio: null;
};

export type HeadlessRenderPlan = FfmpegCommandPlan & {
  inputs: HeadlessRenderPlanInputs;
};

export class HeadlessRenderPlanError extends Error {
  constructor(
    message: string,
    readonly code: 'no_reel' | 'empty_reel',
  ) {
    super(message);
    this.name = 'HeadlessRenderPlanError';
  }
}

/**
 * Compile the exact browser FFmpeg command/filtergraph using symbolic input
 * names only. This function never reads media, starts FFmpeg, or executes code.
 */
export function buildHeadlessRenderPlan(
  project: DirectorProjectFile,
): HeadlessRenderPlan {
  const parsed = parseDirectorProjectFile(project);
  if (!parsed.reelProject) {
    throw new HeadlessRenderPlanError(
      'The project does not contain a reel timeline.',
      'no_reel',
    );
  }
  if (parsed.reelProject.clips.length === 0) {
    throw new HeadlessRenderPlanError(
      'The reel timeline has no clips to render.',
      'empty_reel',
    );
  }

  const reel = parsed.reelProject;
  const images = reel.clips.map((clip, inputIndex) => ({
    inputIndex,
    clipId: clip.id,
    name: `image-${inputIndex}.media`,
  }));
  const structuralEffectInputIndexes: Array<number | null> =
    Array(reel.clips.length).fill(null);
  const structuralEffects: HeadlessRenderPlanInputs['structuralEffects'] = [];
  let nextInputIndex = images.length;
  reel.clips.forEach((clip, clipIndex) => {
    const effects = structuralEffectIds(reelVisualEffectStack(clip));
    if (effects.length === 0) return;
    const inputIndex = nextInputIndex;
    nextInputIndex += 1;
    structuralEffectInputIndexes[clipIndex] = inputIndex;
    structuralEffects.push({
      inputIndex,
      clipId: clip.id,
      effects,
      pattern: `structural-effect-${clipIndex}-%04d.png`,
    });
  });

  const textLayerInputs: TextLayerCommandInput[] = [];
  const textLayers: HeadlessRenderPlanInputs['textLayers'] = [];
  reel.clips.forEach((clip, clipIndex) => {
    clip.textLayers.forEach((layer, layerOrdinal) => {
      if (!layer.content.trim()) return;
      const inputIndex = nextInputIndex;
      nextInputIndex += 1;
      const name = `text-${clipIndex}-${layerOrdinal}.png`;
      textLayerInputs.push({ clipIndex, inputIndex, name, layer });
      textLayers.push({ inputIndex, clipId: clip.id, layerId: layer.id, name });
    });
  });

  const plan = buildFfmpegCommand(
    reel,
    images.map((input) => input.name),
    structuralEffectInputIndexes,
    textLayerInputs,
    null,
  );
  return {
    ...plan,
    inputs: {
      images,
      structuralEffects,
      textLayers,
      audio: null,
    },
  };
}
