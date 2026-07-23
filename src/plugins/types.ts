import type { z } from 'zod';

export type PluginKind = 'effect' | 'transition' | 'motion';
export type EffectSurface = 'grade' | 'visual';
export type EffectStage = 'grade' | 'pre-motion' | 'post-motion';
export type PluginParamsSchema = z.ZodObject;
export type PluginParamValues = Readonly<Record<string, unknown>>;

export type RangeParamHint = {
  control: 'range';
  label: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
};

export type NumberParamHint = {
  control: 'number';
  label: string;
  min?: number;
  max?: number;
  step?: number;
};

export type SelectParamHint = {
  control: 'select';
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
};

export type ToggleParamHint = {
  control: 'toggle';
  label: string;
};

export type PluginParamHint =
  | RangeParamHint
  | NumberParamHint
  | SelectParamHint
  | ToggleParamHint;

export type PluginParamsDefinition<TSchema extends PluginParamsSchema = PluginParamsSchema> = {
  schema: TSchema;
  ui: Partial<Record<Extract<keyof z.output<TSchema>, string>, PluginParamHint>>;
};

export type StructuralEffectFrameOptions = {
  phase: number;
  progress: number;
  seed: number;
  intensity: number;
  /** Engine metadata for deterministic, discrete render schedules. */
  frameIndex?: number;
  frameCount?: number;
  baseSeed?: number;
};

export type EffectFrameInput<TParams extends PluginParamValues = PluginParamValues> =
  StructuralEffectFrameOptions & {
    sourceRgba: Uint8ClampedArray;
    width: number;
    height: number;
    params: TParams;
  };

export type EffectFfmpegInput<TParams extends PluginParamValues = PluginParamValues> = {
  inputLabel: string;
  outputLabel: string;
  stageId: string;
  duration: number;
  fps: number;
  intensity: number;
  params: TParams;
};

export type EffectGradeInput<TParams extends PluginParamValues = PluginParamValues> = {
  intensity: number;
  params: TParams;
};

export type CameraPose = {
  zoom: number;
  focusX: number;
  focusY: number;
};

export type CameraFfmpegExpressions = {
  zoom: string;
  focusX: string;
  focusY: string;
};

export type MotionFrameInput<TParams extends PluginParamValues = PluginParamValues> = {
  progress: number;
  params: TParams;
};

export type MotionFfmpegInput<TParams extends PluginParamValues = PluginParamValues> = {
  progressFrames: number;
  params: TParams;
};

export type TransitionPreviewInput<TParams extends PluginParamValues = PluginParamValues> = {
  progress: number;
  width: number;
  height: number;
  params: TParams;
};

export type TransitionPreviewState = {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
};

export type TransitionFfmpegInput<TParams extends PluginParamValues = PluginParamValues> = {
  params: TParams;
};

/**
 * Per-pixel transition input. `frameA`/`frameB` are the two clips' composited
 * boundary frames (RGBA, length = width*height*4); `progress` is already eased
 * to 0..1. A transition's `renderFrame` MUST return exactly frameA at progress 0
 * and frameB at progress 1, and must express every spatial quantity as a
 * fraction of the frame so 540-wide preview and 1080-wide export are the same
 * transition at different sampling densities.
 */
export type TransitionFrameInput<TParams extends PluginParamValues = PluginParamValues> = {
  frameA: Uint8ClampedArray;
  frameB: Uint8ClampedArray;
  progress: number;
  width: number;
  height: number;
  params: TParams;
};

export type LegacyCanvasEffectInput = {
  context: CanvasRenderingContext2D;
  clipId: string;
  width: number;
  height: number;
  progress: number;
  duration: number;
  fps: number;
  intensity: number;
};

type PluginBase<
  TKind extends PluginKind,
  TSchema extends PluginParamsSchema,
> = {
  id: string;
  kind: TKind;
  displayName: string;
  description: string;
  /** Stable sort key. Ties are resolved by id, never registration order. */
  order: number;
  params: PluginParamsDefinition<TSchema>;
  hidden?: boolean;
  deprecated?: boolean;
};

type EffectPluginBase<TSchema extends PluginParamsSchema> =
  PluginBase<'effect', TSchema> & {
    heavy?: boolean;
    textureCritical?: boolean;
    preferredUntouchedDuration?: number;
  };

type EffectFrameTransform<TSchema extends PluginParamsSchema> = (
  /**
   * Pure render hook: do not mutate sourceRgba or depend on time, randomness,
   * DOM state, network state, or module-level mutable state.
   */
  input: EffectFrameInput<z.output<TSchema>>,
) => Uint8ClampedArray;

type EffectFiltergraph<TSchema extends PluginParamsSchema> = (
  /** Pure filtergraph contribution for one fully described render stage. */
  input: EffectFfmpegInput<z.output<TSchema>>,
) => readonly string[];

export type GradeEffectPlugin<TSchema extends PluginParamsSchema = PluginParamsSchema> =
  EffectPluginBase<TSchema> & {
    surface: 'grade';
    stage: 'grade';
    /** Pure Canvas filter for the supplied intensity and parsed parameters. */
    previewCssFilter: (input: EffectGradeInput<z.output<TSchema>>) => string;
    /** Pure FFmpeg filter counterpart to previewCssFilter. */
    ffmpegGradeFilter: (input: EffectGradeInput<z.output<TSchema>>) => string;
    /** Internal bridge for legacy grade finishes that predate RGBA plugins. */
    legacyPreviewGradeFinish?: (input: LegacyCanvasEffectInput) => void;
    frameTransform?: never;
    ffmpegFiltergraph?: never;
    legacyPreviewCanvas?: never;
    noOp?: never;
  };

export type PreMotionEffectPlugin<TSchema extends PluginParamsSchema = PluginParamsSchema> =
  EffectPluginBase<TSchema> & {
    surface: 'visual';
    stage: 'pre-motion';
    frameTransform: EffectFrameTransform<TSchema>;
    ffmpegFiltergraph?: never;
    previewCssFilter?: never;
    ffmpegGradeFilter?: never;
    legacyPreviewCanvas?: never;
    legacyPreviewGradeFinish?: never;
    noOp?: false;
  };

export type NoOpEffectPlugin<TSchema extends PluginParamsSchema = PluginParamsSchema> =
  EffectPluginBase<TSchema> & {
    id: 'none';
    surface: 'visual';
    stage: 'pre-motion';
    noOp: true;
    frameTransform?: never;
    ffmpegFiltergraph?: never;
    previewCssFilter?: never;
    ffmpegGradeFilter?: never;
    legacyPreviewCanvas?: never;
    legacyPreviewGradeFinish?: never;
  };

type PostMotionPreview<TSchema extends PluginParamsSchema> =
  | {
    frameTransform: EffectFrameTransform<TSchema>;
    legacyPreviewCanvas?: never;
  }
  | {
    /** Internal bridge only; new plugins must use frameTransform. */
    deprecated: true;
    frameTransform?: never;
    legacyPreviewCanvas: (input: LegacyCanvasEffectInput) => void;
  };

export type PostMotionEffectPlugin<TSchema extends PluginParamsSchema = PluginParamsSchema> =
  EffectPluginBase<TSchema> & {
    surface: 'visual';
    stage: 'post-motion';
    ffmpegFiltergraph: EffectFiltergraph<TSchema>;
    previewCssFilter?: never;
    ffmpegGradeFilter?: never;
    legacyPreviewGradeFinish?: never;
    noOp?: never;
  } & PostMotionPreview<TSchema>;

export type EffectPlugin<TSchema extends PluginParamsSchema = PluginParamsSchema> =
  | GradeEffectPlugin<TSchema>
  | PreMotionEffectPlugin<TSchema>
  | PostMotionEffectPlugin<TSchema>
  | NoOpEffectPlugin<TSchema>;

export type MotionPlugin<TSchema extends PluginParamsSchema = PluginParamsSchema> =
  PluginBase<'motion', TSchema> & {
    /** Pure preview pose for the supplied normalized progress and parameters. */
    cameraPose: (input: MotionFrameInput<z.output<TSchema>>) => CameraPose;
    /** Pure FFmpeg expression counterpart to cameraPose. */
    ffmpegExpressions: (
      input: MotionFfmpegInput<z.output<TSchema>>,
    ) => CameraFfmpegExpressions;
  };

export type TransitionPlugin<TSchema extends PluginParamsSchema = PluginParamsSchema> =
  PluginBase<'transition', TSchema> & {
    /** Pure preview composition state for the supplied progress and parameters. */
    preview: (
      input: TransitionPreviewInput<z.output<TSchema>>,
    ) => TransitionPreviewState;
    /** Pure FFmpeg xfade-name counterpart to preview. */
    ffmpegTransition: (
      input: TransitionFfmpegInput<z.output<TSchema>>,
    ) => string;
    /**
     * Optional pure per-pixel blend. When present it is the single source of
     * truth for both preview and export (the affine `preview`/`ffmpegTransition`
     * become fallbacks). See {@link TransitionFrameInput}.
     */
    renderFrame?: (
      input: TransitionFrameInput<z.output<TSchema>>,
    ) => Uint8ClampedArray;
    /**
     * `reduced` tells the preview to process at a coarser scale and show a
     * "preview simplified — export is full quality" note. Export is always full.
     */
    previewQuality?: 'full' | 'reduced';
  };

export type DirectorPlugin<TSchema extends PluginParamsSchema = PluginParamsSchema> =
  | EffectPlugin<TSchema>
  | MotionPlugin<TSchema>
  | TransitionPlugin<TSchema>;

// Registry storage intentionally erases each module's inferred parameter
// object. Plugin authors retain full inference inside define*Plugin().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDirectorPlugin = DirectorPlugin<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEffectPlugin = EffectPlugin<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMotionPlugin = MotionPlugin<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTransitionPlugin = TransitionPlugin<any>;

export function defineEffectPlugin<TSchema extends PluginParamsSchema>(
  plugin: EffectPlugin<TSchema>,
) {
  return plugin;
}

export function defineMotionPlugin<TSchema extends PluginParamsSchema>(
  plugin: MotionPlugin<TSchema>,
) {
  return plugin;
}

export function defineTransitionPlugin<TSchema extends PluginParamsSchema>(
  plugin: TransitionPlugin<TSchema>,
) {
  return plugin;
}
