import { pixelSortRgba } from './pixelSortEngine';
import { structuralEffectSeed } from './effectRecipes';
import type { CanonicalReelVisualEffect } from '../../../shared/reelVisualEffects';
import { thresholdMeltPlugin } from './structuralEffects/thresholdMelt';
import { glitchBurstPlugin } from './structuralEffects/glitchBurst';
import { halftoneRevealPlugin } from './structuralEffects/halftoneReveal';
import { rippleDriftPlugin } from './structuralEffects/rippleDrift';

export type StructuralEffectId = Exclude<
  CanonicalReelVisualEffect,
  'none' | 'crt-scan' | 'motion-echo'
>;
export const STRUCTURAL_EFFECT_IDS = [
  'pixel-sort',
  'glitch-burst',
  'halftone-reveal',
  'ripple-drift',
  'threshold-melt',
] as const satisfies readonly StructuralEffectId[];

export type StructuralEffectFrameOptions = {
  phase: number;
  progress: number;
  seed: number;
  intensity: number;
  /** Engine metadata for discrete schedules; plugins still key visuals from the four fields above. */
  frameIndex?: number;
  frameCount?: number;
  baseSeed?: number;
};

export interface StructuralEffectPlugin {
  id: StructuralEffectId;
  renderFrame: (
    sourceRgba: Uint8ClampedArray,
    width: number,
    height: number,
    options: StructuralEffectFrameOptions,
  ) => Uint8ClampedArray;
}

export type StructuralEffectStackOptions = StructuralEffectFrameOptions & {
  effectSeeds?: Partial<Record<StructuralEffectId, number>>;
};

const pixelSortPlugin: StructuralEffectPlugin = {
  id: 'pixel-sort',
  renderFrame(sourceRgba, width, height, options) {
    return pixelSortRgba(sourceRgba, width, height, {
      intensity: options.intensity,
      seed: options.seed,
      phase: options.phase,
    });
  },
};

const STRUCTURAL_EFFECT_PLUGINS: Record<StructuralEffectId, StructuralEffectPlugin> = {
  'pixel-sort': pixelSortPlugin,
  'glitch-burst': glitchBurstPlugin,
  'halftone-reveal': halftoneRevealPlugin,
  'ripple-drift': rippleDriftPlugin,
  'threshold-melt': thresholdMeltPlugin,
};

export function isStructuralEffect(value: string): value is StructuralEffectId {
  return Object.hasOwn(STRUCTURAL_EFFECT_PLUGINS, value);
}

export function structuralEffectIds(values: readonly string[]) {
  return values.filter(isStructuralEffect);
}

export function structuralEffectPlugin(id: StructuralEffectId) {
  return STRUCTURAL_EFFECT_PLUGINS[id];
}

export function renderStructuralEffectFrame(
  id: StructuralEffectId,
  sourceRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: StructuralEffectFrameOptions,
) {
  if (sourceRgba.length !== width * height * 4) {
    throw new Error('Structural-effect source dimensions do not match.');
  }
  if (options.phase <= 0 || options.progress <= 0 || options.progress >= 1) return sourceRgba.slice();
  return structuralEffectPlugin(id).renderFrame(sourceRgba, width, height, options);
}

export function renderStructuralEffectStackFrame(
  ids: readonly StructuralEffectId[],
  sourceRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: StructuralEffectStackOptions,
) {
  if (options.phase <= 0 || options.progress <= 0 || options.progress >= 1 || ids.length === 0) {
    return sourceRgba.slice();
  }
  let frame: Uint8ClampedArray = sourceRgba.slice();
  ids.forEach((id) => {
    const mappedBaseSeed = options.effectSeeds?.[id];
    const baseSeed = mappedBaseSeed ?? options.baseSeed ?? options.seed;
    const seed = mappedBaseSeed === undefined
      ? options.seed
      : structuralEffectSeed(mappedBaseSeed, options.frameIndex ?? 0);
    frame = renderStructuralEffectFrame(id, frame, width, height, {
      ...options,
      seed,
      baseSeed,
    });
  });
  return frame;
}
