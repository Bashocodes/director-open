import {
  pluginRegistry,
  resolvedPluginParams,
} from '../../../plugins/registry';
import type { ReelClip } from './types';
import {
  clamp01,
  effectSeed,
  structuralEffectSampleAtProgress,
} from './effectRecipes';
import {
  isStructuralEffect,
  renderStructuralEffectStackFrame,
  type StructuralEffectId,
} from './structuralEffects';

const PIXEL_SORT_PREVIEW_SCALE = 0.75;
const PIXEL_SORT_PREVIEW_FALLBACK_SCALE = 0.52;
const PIXEL_SORT_PREVIEW_BUDGET_MS = 35;

type PixelSortPreviewState = {
  scale: number;
  warned: boolean;
  cacheKey?: string;
  effectCanvas?: HTMLCanvasElement;
  lastSortMs?: number;
};

export type PixelSortPreviewMetrics = {
  sortMs: number;
  workWidth: number;
  workHeight: number;
  scale: number;
  morphologyFrame: number;
  phase: number;
  cacheHit: boolean;
};

const pixelSortPreviewStates = new WeakMap<HTMLCanvasElement, PixelSortPreviewState>();
function buffer(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function snapshot(context: CanvasRenderingContext2D, width: number, height: number) {
  const canvas = buffer(width, height);
  canvas.getContext('2d')?.drawImage(context.canvas, 0, 0, width, height);
  return canvas;
}

export function previewGradeFilter(
  effect: string,
  intensity: number,
  params: Readonly<Record<string, unknown>> = {},
) {
  const plugin = pluginRegistry.getEffect(effect, 'grade');
  if (plugin?.previewCssFilter) {
    return plugin.previewCssFilter({
      intensity,
      params: resolvedPluginParams(plugin, params, { intensity }),
    });
  }
  return 'none';
}

export function applyPreviewGradeFinish(
  context: CanvasRenderingContext2D,
  effect: string,
  intensity: number,
  width: number,
  height: number,
) {
  const plugin = pluginRegistry.getEffect(effect, 'grade');
  if (plugin?.legacyPreviewGradeFinish) {
    plugin.legacyPreviewGradeFinish({
      context,
      clipId: '',
      width,
      height,
      progress: 0,
      duration: 0,
      fps: 0,
      intensity,
    });
    return;
  }
}

export function applyPreviewStructuralEffects(options: {
  context: CanvasRenderingContext2D;
  clip: ReelClip;
  effects: readonly StructuralEffectId[];
  width: number;
  height: number;
  progress: number;
  fps: number;
}): PixelSortPreviewMetrics | undefined {
  const { context, clip, effects, width, height, progress, fps } = options;
  if (effects.length === 0) return undefined;
  const effectSeeds = Object.fromEntries(
    effects.map((effect) => [effect, effectSeed(`${clip.id}:${effect}`)]),
  );
  const baseSeed = effectSeeds[effects[0]];
  const sample = structuralEffectSampleAtProgress(
    progress,
    clip.duration,
    fps,
    baseSeed,
  );
  if (sample.phase <= 0.001) return undefined;
  const state = pixelSortPreviewStates.get(context.canvas) ?? {
    scale: PIXEL_SORT_PREVIEW_SCALE,
    warned: false,
  };
  pixelSortPreviewStates.set(context.canvas, state);
  const activeScale = state.scale;
  const workWidth = Math.min(width, Math.max(240, Math.round(width * activeScale)));
  const workHeight = Math.max(120, Math.round(height * workWidth / width));
  const cacheKey = [
    clip.id,
    clip.imageUrl,
    effects.join('+'),
    clip.intensity,
    JSON.stringify(clip.pluginParams || {}),
    sample.frameIndex,
    sample.phase.toFixed(6),
    sample.seed.toFixed(6),
    workWidth,
    workHeight,
  ].join(':');
  const cacheHit = state.cacheKey === cacheKey && Boolean(state.effectCanvas);
  const effect = state.effectCanvas ?? buffer(workWidth, workHeight);
  state.effectCanvas = effect;
  if (effect.width !== workWidth || effect.height !== workHeight) {
    effect.width = workWidth;
    effect.height = workHeight;
  }
  const effectContext = effect.getContext('2d', { willReadFrequently: true });
  if (!effectContext) return;
  if (!cacheHit) {
    const source = snapshot(context, width, height);
    effectContext.imageSmoothingEnabled = true;
    effectContext.clearRect(0, 0, workWidth, workHeight);
    effectContext.drawImage(source, 0, 0, workWidth, workHeight);
    const frame = effectContext.getImageData(0, 0, workWidth, workHeight);
    const started = performance.now();
    frame.data.set(renderStructuralEffectStackFrame(effects, frame.data, workWidth, workHeight, {
      intensity: clip.intensity,
      seed: sample.seed,
      phase: sample.phase,
      progress: sample.progress,
      baseSeed,
      frameIndex: sample.frameIndex,
      frameCount: sample.frameCount,
      effectSeeds,
      pluginParams: clip.pluginParams,
    }));
    const sortMs = performance.now() - started;
    state.lastSortMs = sortMs;
    state.cacheKey = cacheKey;
    effectContext.putImageData(frame, 0, 0);
    if (activeScale === PIXEL_SORT_PREVIEW_SCALE && sortMs > PIXEL_SORT_PREVIEW_BUDGET_MS) {
      state.scale = PIXEL_SORT_PREVIEW_FALLBACK_SCALE;
      if (!state.warned) {
        console.info(
          `[Director Open] Structural-effect preview took ${sortMs.toFixed(1)} ms at `
          + `${workWidth}×${workHeight}; using ${Math.round(PIXEL_SORT_PREVIEW_FALLBACK_SCALE * 100)}% resolution next frame.`,
        );
        state.warned = true;
      }
    }
  }
  context.save();
  context.globalAlpha = 1;
  context.imageSmoothingEnabled = false;
  context.drawImage(effect, 0, 0, width, height);
  context.restore();
  return {
    sortMs: state.lastSortMs ?? 0,
    workWidth,
    workHeight,
    scale: workWidth / width,
    morphologyFrame: sample.frameIndex,
    phase: sample.phase,
    cacheHit,
  };
}

export function applyPreviewVisualEffect(options: {
  context: CanvasRenderingContext2D;
  clip: ReelClip;
  effect: string;
  width: number;
  height: number;
  progress: number;
  fps: number;
}) {
  const { context, clip, effect, width, height, progress, fps } = options;
  if (isStructuralEffect(effect)) {
    return applyPreviewStructuralEffects({ context, clip, effects: [effect], width, height, progress, fps });
  }
  const plugin = pluginRegistry.getEffect(effect, 'visual');
  if (plugin?.frameTransform) {
    const baseSeed = effectSeed(`${clip.id}:${effect}`);
    const sample = structuralEffectSampleAtProgress(
      progress,
      clip.duration,
      fps,
      baseSeed,
    );
    const frame = context.getImageData(0, 0, width, height);
    frame.data.set(plugin.frameTransform({
      sourceRgba: frame.data,
      width,
      height,
      intensity: clip.intensity,
      phase: sample.phase,
      progress: sample.progress,
      seed: sample.seed,
      baseSeed,
      frameIndex: sample.frameIndex,
      frameCount: sample.frameCount,
      params: resolvedPluginParams(
        plugin,
        clip.pluginParams?.[effect],
        { intensity: clip.intensity },
      ),
    }));
    context.putImageData(frame, 0, 0);
    return;
  }
  if (plugin?.legacyPreviewCanvas) {
    plugin.legacyPreviewCanvas({
      context,
      clipId: clip.id,
      width,
      height,
      progress,
      duration: clip.duration,
      fps,
      intensity: clip.intensity,
    });
    return;
  }
}
