import type {
  ReelAspectRatio,
  ReelQuality,
  TextLayer,
} from '../../../shared/directorSchemas';
import type {
  DirectorColorDepth,
  DirectorRenderBackend,
} from '../../../shared/directorRenderBackend';

export type { TextLayer };

export type ReelClip = {
  id: string;
  objectId: string | null;
  title: string;
  imageUrl: string;
  sourceFile?: File;
  duration: number;
  /** True once a person or Director action has deliberately set this duration. */
  durationWasUserSet?: boolean;
  effect: string;
  /** Ordered color-grade layers. `effect` remains the backwards-compatible base layer. */
  gradeStack?: string[];
  visualEffect?: string;
  /** Ordered optical/effect layers. `visualEffect` remains the backwards-compatible base layer. */
  visualEffectStack?: string[];
  transition: string;
  transitionDuration: number;
  motion: string;
  intensity: number;
  /** Additive parameters for registered plugins; legacy strength/blend stay on their old fields. */
  pluginParams?: Record<string, Record<string, unknown>>;
  /** Ordered text layers (later = drawn on top). Replaces the legacy caption string. */
  textLayers: TextLayer[];
};

function unique<T extends string>(values: readonly T[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export function reelGradeStack(clip: ReelClip): string[] {
  return unique((clip.gradeStack?.length ? clip.gradeStack : [clip.effect]).filter(Boolean)).slice(0, 5);
}

export function reelVisualEffectStack(clip: ReelClip): string[] {
  const values = clip.visualEffectStack?.length
    ? clip.visualEffectStack
    : [clip.visualEffect || 'none'];
  return unique(values.filter((effect) => effect !== 'none')).slice(0, 5);
}
export type ReelAudio = {
  name: string;
  url: string;
  sourceFile: File;
};

export type ReelProject = {
  id: string;
  title: string;
  aspectRatio: ReelAspectRatio;
  fps: 24 | 30;
  quality: ReelQuality;
  clips: ReelClip[];
  selectedClipIds: string[];
  audio: ReelAudio | null;
  /** Optional for backwards-compatible projects; normalize to FFmpeg at use sites. */
  renderBackend?: DirectorRenderBackend;
  /** Internal processing precision. Adobe uses this for the composition bpc setting. */
  colorDepth?: DirectorColorDepth;
  renderRequested: boolean;
};

export type RenderStage = 'idle' | 'loading' | 'preparing' | 'rendering' | 'cancelling' | 'complete' | 'error';

export type ReelRenderState = {
  stage: RenderStage;
  progress: number;
  message: string;
  outputUrl: string | null;
  outputBytes: number | null;
};

export const INITIAL_RENDER_STATE: ReelRenderState = {
  stage: 'idle',
  progress: 0,
  message: '',
  outputUrl: null,
  outputBytes: null,
};
