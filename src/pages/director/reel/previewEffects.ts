import type { ReelEffect, ReelVisualEffect } from '../../../shared/directorSchemas';
import type { ReelClip } from './types';
import {
  clamp01,
  effectSeed,
  effectStrength,
  mix,
  structuralEffectSampleAtProgress,
  premiumLoopEnvelope,
} from './effectRecipes';
import {
  isStructuralEffect,
  renderStructuralEffectStackFrame,
  type StructuralEffectId,
} from './structuralEffects';
import { motionEchoRgba } from './motionEchoPreview';

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
const motionEchoPreviewStates = new WeakMap<HTMLCanvasElement, {
  clipId: string;
  frameIndex: number;
  trail: Uint8ClampedArray;
  output: Uint8ClampedArray;
}>();

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

export function previewGradeFilter(effect: ReelEffect, intensity: number) {
  const amount = clamp01(intensity / 100);
  switch (effect) {
    case 'cinematic': return `contrast(${1.025 + amount * 0.09}) saturate(${0.995 - amount * 0.075}) brightness(${1 - amount * 0.01})`;
    case 'hdr': return `contrast(${1.018 + amount * 0.085}) saturate(${1.008 + amount * 0.075}) brightness(${1 + amount * 0.008})`;
    case 'warm': return `sepia(${amount * 0.12}) saturate(${1 + amount * 0.06}) contrast(${1 + amount * 0.03})`;
    case 'cool': return `hue-rotate(${amount * 7}deg) saturate(${1 - amount * 0.035}) contrast(${1 + amount * 0.035})`;
    case 'mono': return `grayscale(${amount}) contrast(${1.02 + amount * 0.14})`;
    case 'punch': return `contrast(${1.025 + amount * 0.13}) saturate(${1.01 + amount * 0.12})`;
    case 'teal-orange': return `hue-rotate(${-amount * 4}deg) contrast(${1 + amount * 0.085}) saturate(${1 + amount * 0.075})`;
    case 'vintage-film': return `sepia(${amount * 0.2}) contrast(${1 - amount * 0.035}) saturate(${1 - amount * 0.16}) brightness(${1 + amount * 0.025})`;
    case 'bleach-bypass': return `contrast(${1.025 + amount * 0.19}) saturate(${0.98 - amount * 0.39}) brightness(${1 - amount * 0.012})`;
    case 'dream': return `contrast(${1 - amount * 0.04}) saturate(${1 - amount * 0.13}) brightness(${1 + amount * 0.035})`;
    default: return 'none';
  }
}

function drawVignette(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity: number,
  radiusScale = 0.55,
) {
  const radius = Math.hypot(width, height) * radiusScale;
  const vignette = context.createRadialGradient(width / 2, height * 0.46, radius * 0.16, width / 2, height * 0.5, radius);
  vignette.addColorStop(0, 'rgba(3,5,9,0)');
  vignette.addColorStop(0.62, 'rgba(3,5,9,0)');
  vignette.addColorStop(1, `rgba(3,5,9,${opacity})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

export function applyPreviewGradeFinish(
  context: CanvasRenderingContext2D,
  effect: ReelEffect,
  intensity: number,
  width: number,
  height: number,
) {
  const amount = clamp01(intensity / 100);
  if (effect === 'hdr' || effect === 'punch') {
    const source = snapshot(context, width, height);
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.globalAlpha = effect === 'hdr' ? 0.06 + amount * 0.1 : 0.07 + amount * 0.13;
    context.filter = `contrast(${1.06 + amount * 0.08}) saturate(${1.015 + amount * 0.055})`;
    context.drawImage(source, 0, 0);
    context.restore();
  }
  if (effect === 'cinematic') drawVignette(context, width, height, 0.12 + amount * 0.19);
  if (effect === 'vignette') drawVignette(context, width, height, 0.2 + amount * 0.38);
  if (effect === 'glow' || effect === 'dream') applyGlow(context, width, height, amount, effect === 'dream' ? 0.17 : 0.12);
  if (effect === 'blur') {
    const source = snapshot(context, width, height);
    context.save();
    context.globalAlpha = 0.24 + amount * 0.42;
    context.filter = `blur(${0.6 + amount * 6.2}px)`;
    context.drawImage(source, 0, 0);
    context.restore();
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

function applyCrtScan(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  duration: number,
  fps: number,
  intensity: number,
) {
  const amount = effectStrength(intensity);
  const envelope = premiumLoopEnvelope(progress, duration, fps);
  if (envelope <= 0) return;
  const source = snapshot(context, width, height);
  const spacing = Math.max(3, Math.round(mix(7, 4, amount)));
  const elapsed = clamp01(progress) * duration;
  const phase = Math.floor(elapsed * mix(28, 72, amount)) % spacing;
  context.save();
  context.globalAlpha = envelope * amount;
  context.fillStyle = `rgba(4,7,12,${mix(0.035, 0.12, amount)})`;
  for (let y = phase; y < height; y += spacing) context.fillRect(0, y, width, 1);
  context.restore();

  const bandHeight = height * mix(0.06, 0.1, amount);
  const cycle = (elapsed % 2.5) / 2.5;
  const bandTop = cycle * (height + bandHeight) - bandHeight;
  const jitter = Math.sin(elapsed * Math.PI * 14);
  context.save();
  context.beginPath();
  context.rect(0, bandTop, width, bandHeight);
  context.clip();
  context.globalAlpha = envelope;
  context.filter = `brightness(${1 + mix(0.018, 0.055, amount)})`;
  context.drawImage(source, jitter, 0, width, height);
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = envelope * mix(0.025, 0.065, amount);
  context.filter = 'hue-rotate(16deg) saturate(1.2)';
  context.drawImage(source, jitter + 1, 0, width, height);
  context.restore();
}

function applyMotionEcho(
  context: CanvasRenderingContext2D,
  clip: ReelClip,
  width: number,
  height: number,
  progress: number,
  fps: number,
) {
  const envelope = premiumLoopEnvelope(progress, clip.duration, fps);
  const frameCount = Math.max(2, Math.round(clip.duration * fps));
  const frameIndex = Math.min(frameCount - 1, Math.floor(clamp01(progress) * frameCount));
  if (envelope <= 0 || frameIndex <= 0 || frameIndex >= frameCount - 1) {
    motionEchoPreviewStates.delete(context.canvas);
    return;
  }
  const state = motionEchoPreviewStates.get(context.canvas);
  if (state?.clipId === clip.id && state.frameIndex === frameIndex) {
    const repeated = context.getImageData(0, 0, width, height);
    repeated.data.set(state.output);
    context.putImageData(repeated, 0, 0);
    return;
  }
  const current = context.getImageData(0, 0, width, height);
  const strength = effectStrength(clip.intensity);
  const sequentialTrail = state?.clipId === clip.id && state.frameIndex === frameIndex - 1
    ? state.trail
    : undefined;
  const { output, trail } = motionEchoRgba(
    current.data,
    sequentialTrail,
    mix(0.86, 0.96, strength),
    strength * envelope,
  );
  current.data.set(output);
  context.putImageData(current, 0, 0);
  motionEchoPreviewStates.set(context.canvas, { clipId: clip.id, frameIndex, trail, output });
}

function applyGlow(context: CanvasRenderingContext2D, width: number, height: number, amount: number, baseOpacity = 0.07) {
  const source = snapshot(context, width, height);
  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = baseOpacity + amount * 0.11;
  context.filter = `brightness(${0.86 + amount * 0.06}) contrast(${1.42 + amount * 0.38}) blur(${2.2 + amount * 7.5}px) saturate(${1 + amount * 0.06})`;
  context.drawImage(source, 0, 0);
  context.restore();
}

export function applyPreviewVisualEffect(options: {
  context: CanvasRenderingContext2D;
  clip: ReelClip;
  effect: ReelVisualEffect;
  width: number;
  height: number;
  progress: number;
  fps: number;
}) {
  const { context, clip, effect, width, height, progress, fps } = options;
  if (isStructuralEffect(effect)) {
    return applyPreviewStructuralEffects({ context, clip, effects: [effect], width, height, progress, fps });
  }
  if (effect === 'crt-scan') {
    applyCrtScan(context, width, height, progress, clip.duration, fps, clip.intensity);
    return;
  }
  if (effect === 'motion-echo') {
    applyMotionEcho(context, clip, width, height, progress, fps);
    return;
  }
}
