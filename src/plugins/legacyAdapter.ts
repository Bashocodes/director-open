import { z } from 'zod';
import {
  crtFiltergraph,
  legacyCrtPreview,
  legacyGradeFfmpegFilter,
  legacyGradeFinish,
  legacyGradePreviewFilter,
  legacyMotionEchoPreview,
  motionEchoFiltergraph,
} from '../pages/director/reel/legacyEffectRecipes';
import {
  legacyCameraFfmpegExpressions,
  legacyCameraPoseAt,
} from '../pages/director/reel/legacyMotionRecipes';
import { pixelSortRgba } from '../pages/director/reel/pixelSortEngine';
import { glitchBurstPlugin } from '../pages/director/reel/structuralEffects/glitchBurst';
import { rippleDriftPlugin } from '../pages/director/reel/structuralEffects/rippleDrift';
import { thresholdMeltPlugin } from '../pages/director/reel/structuralEffects/thresholdMelt';
import type {
  AnyDirectorPlugin,
  EffectPlugin,
  MotionFfmpegInput,
  MotionFrameInput,
  TransitionPreviewInput,
} from './types';

const IntensityParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(62),
});
const EmptyParamsSchema = z.object({});

const intensityUi = {
  intensity: {
    control: 'range',
    label: 'Strength',
    min: 0,
    max: 100,
    step: 1,
    suffix: '%',
  },
} as const;

const gradeDefinitions = [
  ['clean', 'Clean', 'Neutral grade with source detail intact.', false],
  ['cinematic', 'Cinematic', 'Restrained saturation, richer contrast, subtle vignette.', false],
  ['hdr', 'HDR look', 'Highlight-safe tone curve, local contrast, and restrained micro-detail.', false],
  ['warm', 'Warm', 'Amber-biased highlights and softened blue response.', false],
  ['cool', 'Cool', 'Steel-blue shadows and controlled warmth.', false],
  ['mono', 'Monochrome', 'High-contrast black and white treatment.', false],
  ['dream', 'Dream', 'Compatibility grade retained for saved projects.', true],
  ['vignette', 'Vignette', 'Compatibility grade retained for saved projects.', true],
  ['blur', 'Blur', 'Compatibility grade retained for saved projects.', true],
  ['punch', 'Punchy detail', 'Dense contrast, saturated color, and crisp edges.', false],
  ['teal-orange', 'Teal + orange', 'Cool shadows with warm skin-biased highlights.', false],
  ['vintage-film', 'Vintage film', 'Faded warmth, restrained saturation, and fine grain.', false],
  ['glow', 'Glow', 'Compatibility grade retained for saved projects.', true],
  ['bleach-bypass', 'Bleach bypass', 'Desaturated metallic contrast for a severe cinematic finish.', false],
] as const;

const gradePlugins = gradeDefinitions.map(([id, displayName, description, hidden], order) => ({
  id,
  kind: 'effect',
  surface: 'grade',
  stage: 'grade',
  displayName,
  description,
  order,
  hidden,
  deprecated: true,
  params: { schema: IntensityParamsSchema, ui: intensityUi },
  previewCssFilter: ({ intensity }) => legacyGradePreviewFilter(id, intensity),
  ffmpegGradeFilter: ({ intensity }) => legacyGradeFfmpegFilter(id, intensity),
  legacyPreviewGradeFinish: (input) => legacyGradeFinish(id, input),
}) satisfies EffectPlugin<typeof IntensityParamsSchema>);

const visualDefinitions = [
  ['none', 'None', 'No structural visual effect.'],
  ['pixel-sort', 'Pixel sort', 'Luminance-sorted tears grow across the frame, then recover cleanly.'],
  ['glitch-burst', 'Glitch burst', 'Seeded digital slice hits with abrupt clean recovery frames.'],
  ['crt-scan', 'CRT scan', 'Fine moving raster lines and a restrained rolling sync disturbance.'],
  ['ripple-drift', 'Ripple drift', 'Slow crossed-wave displacement bends the frame like liquid.'],
  ['motion-echo', 'Motion echo', 'Camera movement leaves decaying highlight trails that clear before the loop.'],
  ['threshold-melt', 'Threshold melt', 'Color sweeps into a crawling two-tone print treatment, then resolves.'],
] as const;

const structuralRenderers = {
  'pixel-sort': (
    sourceRgba: Uint8ClampedArray,
    width: number,
    height: number,
    options: { intensity: number; seed: number; phase: number },
  ) => pixelSortRgba(sourceRgba, width, height, {
    intensity: options.intensity,
    seed: options.seed,
    phase: options.phase,
  }),
  'glitch-burst': glitchBurstPlugin.renderFrame,
  'ripple-drift': rippleDriftPlugin.renderFrame,
  'threshold-melt': thresholdMeltPlugin.renderFrame,
} as const;

const visualPlugins = visualDefinitions.map(([id, displayName, description], index) => {
  const renderer = id in structuralRenderers
    ? structuralRenderers[id as keyof typeof structuralRenderers]
    : undefined;
  const common = {
    id,
    kind: 'effect',
    surface: 'visual',
    displayName,
    description,
    order: id === 'ripple-drift' ? 5 : id === 'motion-echo' ? 6 : id === 'threshold-melt' ? 7 : index,
    deprecated: true as const,
    heavy: id !== 'none',
    textureCritical: id === 'pixel-sort' || id === 'crt-scan' || id === 'threshold-melt',
    preferredUntouchedDuration: id === 'pixel-sort' ? 6.4 : undefined,
    params: { schema: IntensityParamsSchema, ui: intensityUi },
  } as const;
  if (id === 'none') {
    return {
      ...common,
      id,
      stage: 'pre-motion',
      noOp: true,
    } satisfies EffectPlugin<typeof IntensityParamsSchema>;
  }
  if (id === 'crt-scan') {
    return {
      ...common,
      id,
      stage: 'post-motion',
      ffmpegFiltergraph: crtFiltergraph,
      legacyPreviewCanvas: legacyCrtPreview,
    } satisfies EffectPlugin<typeof IntensityParamsSchema>;
  }
  if (id === 'motion-echo') {
    return {
      ...common,
      id,
      stage: 'post-motion',
      ffmpegFiltergraph: motionEchoFiltergraph,
      legacyPreviewCanvas: legacyMotionEchoPreview,
    } satisfies EffectPlugin<typeof IntensityParamsSchema>;
  }
  if (!renderer) throw new Error(`Missing legacy structural renderer for ${id}.`);
  return {
    ...common,
    id,
    stage: 'pre-motion',
    frameTransform: (input) => renderer(
        input.sourceRgba,
        input.width,
        input.height,
        {
          phase: input.phase,
          progress: input.progress,
          seed: input.seed,
          intensity: input.params.intensity,
          frameIndex: input.frameIndex,
          frameCount: input.frameCount,
          baseSeed: input.baseSeed,
        },
      ),
  } satisfies EffectPlugin<typeof IntensityParamsSchema>;
});

const motionDefinitions = [
  ['still', 'Still', 'No virtual camera movement.'],
  ['pull-out', 'Pull out', 'Slow reveal from detail to wider frame.'],
  ['pan-left', 'Pan left', 'Traverse from right to left.'],
  ['pan-right', 'Pan right', 'Traverse from left to right.'],
  ['pan-up', 'Pan up', 'Rise through the composition.'],
  ['pan-down', 'Pan down', 'Descend through the composition.'],
  ['drift-up-left', 'Drift up + left', 'A slow diagonal float toward the upper-left.'],
  ['drift-down-right', 'Drift down + right', 'A slow diagonal float toward the lower-right.'],
  ['pulse', 'Cinematic pulse', 'A restrained push in and ease back.'],
  ['hero-push', 'Hero push', 'A stronger eased push with an upward subject reveal.'],
  ['arc-left', 'Arc left', 'A curved leftward move that rises gently through the midpoint.'],
  ['arc-right', 'Arc right', 'A curved rightward move that rises gently through the midpoint.'],
  ['float', 'Looping float', 'A seamless figure-eight drift with a quiet optical breath.'],
] as const;
const motionOrder = [
  'still', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down',
  'drift-up-left', 'drift-down-right', 'pulse', 'hero-push', 'arc-left', 'arc-right', 'float',
];

const motionPlugins = motionDefinitions.map(([id, displayName, description]) => ({
  id,
  kind: 'motion',
  displayName,
  description,
  order: motionOrder.indexOf(id),
  deprecated: true,
  params: { schema: EmptyParamsSchema, ui: {} },
  cameraPose: ({ progress }: MotionFrameInput) => legacyCameraPoseAt(id, progress),
  ffmpegExpressions: ({ progressFrames }: MotionFfmpegInput) => (
    legacyCameraFfmpegExpressions(id, progressFrames)
  ),
} as const));

const transitionDefinitions = [
  ['cut', 'Cut', 'Immediate editorial cut.', 'fade'],
  ['crossfade', 'Crossfade', 'Classic opacity dissolve.', 'fade'],
  ['dip-black', 'Dip to black', 'Cinematic breath through black.', 'fadeblack'],
  ['slide-left', 'Slide left', 'Next frame enters from the right.', 'slideleft'],
  ['slide-right', 'Slide right', 'Next frame enters from the left.', 'slideright'],
  ['zoom', 'Iris reveal', 'Circular reveal with a focused center.', 'circleopen'],
  ['soft-dissolve', 'Soft dissolve', 'Textured dissolve for atmospheric edits.', 'dissolve'],
] as const;

const transitionPlugins = transitionDefinitions.map((
  [id, displayName, description, ffmpegTransition],
  order,
) => {
  const defaultDuration = id === 'cut' ? 0 : 0.45;
  const ParamsSchema = z.object({
    duration: z.number().min(0).max(2).default(defaultDuration),
  });
  return {
    id,
    kind: 'transition',
    displayName,
    description,
    order,
    deprecated: true,
    params: {
      schema: ParamsSchema,
      ui: {
        duration: {
          control: 'number',
          label: 'Blend',
          min: 0,
          max: 2,
          step: 0.05,
        },
      },
    },
    preview: ({ progress, width }: TransitionPreviewInput) => {
      const opacity = id === 'dip-black'
        ? Math.min(1, Math.max(0, progress * 2))
        : Math.min(1, Math.max(0, progress));
      return {
        opacity,
        translateX: id === 'slide-left'
          ? width * (1 - opacity)
          : id === 'slide-right'
            ? -width * (1 - opacity)
            : 0,
        translateY: 0,
        scale: 1,
      };
    },
    ffmpegTransition: () => ffmpegTransition,
  } as const;
});

/**
 * Closed legacy recipes enter the public registry here. The adapter is
 * intentionally the only hardcoded roster; UI and render callers never read it.
 */
export const legacyPlugins: readonly AnyDirectorPlugin[] = [
  ...gradePlugins,
  ...visualPlugins,
  ...motionPlugins,
  ...transitionPlugins,
];
