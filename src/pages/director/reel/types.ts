import type {
  ReelAspectRatio,
  ReelEffect,
  ReelMotion,
  ReelQuality,
  ReelTransition,
  ReelVisualEffect,
} from '../../../shared/directorSchemas';

export type ReelClip = {
  id: string;
  objectId: string | null;
  title: string;
  imageUrl: string;
  sourceFile?: File;
  duration: number;
  /** True once a person or Director action has deliberately set this duration. */
  durationWasUserSet?: boolean;
  effect: ReelEffect;
  /** Ordered color-grade layers. `effect` remains the backwards-compatible base layer. */
  gradeStack?: ReelEffect[];
  visualEffect?: ReelVisualEffect;
  /** Ordered optical/effect layers. `visualEffect` remains the backwards-compatible base layer. */
  visualEffectStack?: ReelVisualEffect[];
  transition: ReelTransition;
  transitionDuration: number;
  motion: ReelMotion;
  intensity: number;
  caption: string;
};

function unique<T extends string>(values: readonly T[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export function reelGradeStack(clip: ReelClip): ReelEffect[] {
  return unique((clip.gradeStack?.length ? clip.gradeStack : [clip.effect]).filter(Boolean)).slice(0, 5);
}

export function reelVisualEffectStack(clip: ReelClip): ReelVisualEffect[] {
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
