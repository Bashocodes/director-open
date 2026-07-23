import type {
  EffectFfmpegInput,
  LegacyCanvasEffectInput,
} from '../../../plugins/types';
import {
  clamp01,
  effectStrength,
  mix,
  opticalFfmpegRecipe,
  premiumLoopEnvelope,
} from './effectRecipes';
import { motionEchoRgba } from './motionEchoPreview';

const motionEchoPreviewStates = new WeakMap<HTMLCanvasElement, {
  clipId: string;
  frameIndex: number;
  trail: Uint8ClampedArray;
  output: Uint8ClampedArray;
}>();

function fixed(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function canvasSnapshot(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(context.canvas, 0, 0, width, height);
  return canvas;
}

function drawVignette(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  opacity: number,
) {
  const radius = Math.hypot(width, height) * 0.55;
  const vignette = context.createRadialGradient(
    width / 2,
    height * 0.46,
    radius * 0.16,
    width / 2,
    height * 0.5,
    radius,
  );
  vignette.addColorStop(0, 'rgba(3,5,9,0)');
  vignette.addColorStop(0.62, 'rgba(3,5,9,0)');
  vignette.addColorStop(1, `rgba(3,5,9,${opacity})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function applyGlow(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number,
  baseOpacity = 0.07,
) {
  const source = canvasSnapshot(context, width, height);
  context.save();
  context.globalCompositeOperation = 'screen';
  context.globalAlpha = baseOpacity + amount * 0.11;
  context.filter = `brightness(${0.86 + amount * 0.06}) contrast(${1.42 + amount * 0.38}) blur(${2.2 + amount * 7.5}px) saturate(${1 + amount * 0.06})`;
  context.drawImage(source, 0, 0);
  context.restore();
}

export function legacyGradeFinish(effect: string, input: LegacyCanvasEffectInput) {
  const {
    context, width, height, intensity,
  } = input;
  const amount = clamp01(intensity / 100);
  if (effect === 'hdr' || effect === 'punch') {
    const source = canvasSnapshot(context, width, height);
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.globalAlpha = effect === 'hdr' ? 0.06 + amount * 0.1 : 0.07 + amount * 0.13;
    context.filter = `contrast(${1.06 + amount * 0.08}) saturate(${1.015 + amount * 0.055})`;
    context.drawImage(source, 0, 0);
    context.restore();
  }
  if (effect === 'cinematic') drawVignette(context, width, height, 0.12 + amount * 0.19);
  if (effect === 'vignette') drawVignette(context, width, height, 0.2 + amount * 0.38);
  if (effect === 'glow' || effect === 'dream') {
    applyGlow(context, width, height, amount, effect === 'dream' ? 0.17 : 0.12);
  }
  if (effect === 'blur') {
    const source = canvasSnapshot(context, width, height);
    context.save();
    context.globalAlpha = 0.24 + amount * 0.42;
    context.filter = `blur(${0.6 + amount * 6.2}px)`;
    context.drawImage(source, 0, 0);
    context.restore();
  }
}

export function legacyCrtPreview(input: LegacyCanvasEffectInput) {
  const {
    context, width, height, progress, duration, fps, intensity,
  } = input;
  const amount = effectStrength(intensity);
  const envelope = premiumLoopEnvelope(progress, duration, fps);
  if (envelope <= 0) return;
  const source = canvasSnapshot(context, width, height);
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

export function legacyMotionEchoPreview(input: LegacyCanvasEffectInput) {
  const {
    context, clipId, width, height, progress, duration, fps, intensity,
  } = input;
  const envelope = premiumLoopEnvelope(progress, duration, fps);
  const frameCount = Math.max(2, Math.round(duration * fps));
  const frameIndex = Math.min(frameCount - 1, Math.floor(clamp01(progress) * frameCount));
  if (envelope <= 0 || frameIndex <= 0 || frameIndex >= frameCount - 1) {
    motionEchoPreviewStates.delete(context.canvas);
    return;
  }
  const state = motionEchoPreviewStates.get(context.canvas);
  if (state?.clipId === clipId && state.frameIndex === frameIndex) {
    const repeated = context.getImageData(0, 0, width, height);
    repeated.data.set(state.output);
    context.putImageData(repeated, 0, 0);
    return;
  }
  const current = context.getImageData(0, 0, width, height);
  const strength = effectStrength(intensity);
  const sequentialTrail = state?.clipId === clipId && state.frameIndex === frameIndex - 1
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
  motionEchoPreviewStates.set(context.canvas, {
    clipId,
    frameIndex,
    trail,
    output,
  });
}

/** @deprecated Exact FFmpeg recipes retained until each grade becomes a plugin module. */
export function legacyGradeFfmpegFilter(effect: string, intensity: number) {
  const amount = Math.min(100, Math.max(0, intensity)) / 100;
  const scaled = (low: number, high: number) => fixed(low + (high - low) * amount);
  switch (effect) {
    case 'cinematic':
      return `curves=all='0/0 0.12/${scaled(0.12, 0.095)} 0.5/${scaled(0.5, 0.515)} 0.86/${scaled(0.86, 0.895)} 1/1',`
        + `colorbalance=rs=-${scaled(0, 0.018)}:bs=${scaled(0, 0.026)}:rh=${scaled(0, 0.028)}:bh=-${scaled(0, 0.018)},`
        + `eq=saturation=${scaled(0.995, 0.92)}:gamma=${scaled(1, 0.985)},vignette=angle=${scaled(0.26, 0.46)}`;
    case 'hdr':
      return `curves=all='0/0 0.12/${scaled(0.12, 0.095)} 0.5/${scaled(0.5, 0.525)} 0.82/${scaled(0.82, 0.875)} 0.96/${scaled(0.96, 0.975)} 1/1',`
        + `eq=saturation=${scaled(1.005, 1.085)}:gamma=${scaled(1, 0.992)},unsharp=7:7:${scaled(0.12, 0.52)}:5:5:0`;
    case 'warm':
      return `colorbalance=rs=${scaled(0.008, 0.065)}:gs=${scaled(0.003, 0.022)}:bs=-${scaled(0.008, 0.045)},`
        + `curves=all='0/0 0.2/${scaled(0.2, 0.18)} 0.78/${scaled(0.78, 0.82)} 1/1'`;
    case 'cool':
      return `colorbalance=rs=-${scaled(0.008, 0.05)}:bs=${scaled(0.01, 0.075)},`
        + `curves=all='0/0 0.18/${scaled(0.18, 0.155)} 0.8/${scaled(0.8, 0.84)} 1/1',eq=saturation=${scaled(1, 0.94)}`;
    case 'mono':
      return `hue=s=0,curves=all='0/0 0.18/${scaled(0.18, 0.13)} 0.52/${scaled(0.52, 0.55)} 0.84/${scaled(0.84, 0.9)} 1/1'`;
    case 'dream':
      return `gblur=sigma=${scaled(0.25, 2.4)},eq=saturation=${scaled(0.98, 0.72)}:gamma=${scaled(1.01, 1.11)}`;
    case 'vignette':
      return `vignette=angle=${scaled(0.32, 0.82)}`;
    case 'blur':
      return `gblur=sigma=${scaled(0.35, 9)}`;
    case 'punch':
      return `curves=all='0/0 0.16/${scaled(0.155, 0.115)} 0.5/${scaled(0.5, 0.515)} 0.86/${scaled(0.86, 0.915)} 1/1',`
        + `eq=saturation=${scaled(1.005, 1.14)},unsharp=7:7:${scaled(0.14, 0.64)}:5:5:0`;
    case 'teal-orange':
      return `colorbalance=rs=${scaled(0.006, 0.045)}:gs=-${scaled(0.002, 0.015)}:bs=${scaled(0.006, 0.04)},`
        + `curves=all='0/0 0.18/${scaled(0.18, 0.145)} 0.82/${scaled(0.82, 0.875)} 1/1',eq=saturation=${scaled(1, 1.09)}`;
    case 'vintage-film':
      return `colorbalance=rs=${scaled(0.006, 0.05)}:gs=${scaled(0.003, 0.025)}:bs=-${scaled(0.006, 0.04)},`
        + `curves=all='0/${scaled(0, 0.035)} 0.2/${scaled(0.2, 0.215)} 0.8/${scaled(0.8, 0.78)} 1/${scaled(1, 0.96)}',`
        + `eq=saturation=${scaled(1, 0.82)},noise=alls=${scaled(0, 5.5)}:allf=t`;
    case 'glow':
      return `gblur=sigma=${scaled(0.05, 1.25)},eq=brightness=${scaled(0, 0.035)}:gamma=${scaled(1, 1.08)}:saturation=${scaled(1, 1.08)}`;
    case 'bleach-bypass':
      return `curves=all='0/0 0.17/${scaled(0.165, 0.105)} 0.5/${scaled(0.5, 0.52)} 0.84/${scaled(0.84, 0.92)} 1/1',`
        + `eq=saturation=${scaled(0.96, 0.56)},unsharp=5:5:${scaled(0.1, 0.55)}:5:5:0`;
    case 'clean':
    default:
      return 'null';
  }
}

/** @deprecated Exact Canvas filter recipes retained by the compatibility adapter. */
export function legacyGradePreviewFilter(effect: string, intensity: number) {
  const amount = Math.min(1, Math.max(0, intensity / 100));
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

export function crtFiltergraph(input: EffectFfmpegInput) {
  const strength = effectStrength(input.intensity);
  const bandFraction = fixed(mix(0.06, 0.1, strength));
  const brightness = fixed(mix(0.018, 0.055, strength));
  const spacing = Math.max(3, Math.round(mix(7, 4, strength)));
  const lineSpeed = Math.max(12, Math.round(mix(28, 72, strength)));
  const lineOpacity = fixed(mix(0.035, 0.12, strength));
  const bandTop = `mod(T*(H+H*${bandFraction})/2.5,H+H*${bandFraction})-H*${bandFraction}`;
  const recipe = opticalFfmpegRecipe({
    intensity: input.intensity,
    duration: input.duration,
    fps: input.fps,
  });
  return [
    `[${input.inputLabel}]format=rgba,split=4`
      + `[${input.stageId}-clean-rgba][${input.stageId}-base-rgba]`
      + `[${input.stageId}-band-rgba][${input.stageId}-mask-rgba]`,
    `[${input.stageId}-clean-rgba]format=yuv444p[${input.stageId}-clean]`,
    `[${input.stageId}-base-rgba]format=yuv444p[${input.stageId}-base]`,
    `[${input.stageId}-band-rgba]rgbashift=rh=1:bh=-1:edge=smear,`
      + `crop=iw-2:ih:x='1+sin(2*PI*t*7)',scale=iw+2:ih,`
      + `eq=brightness=${brightness},format=yuv444p[${input.stageId}-band]`,
    `[${input.stageId}-mask-rgba]format=yuv444p,`
      + `geq=lum='if(between(Y\\,${bandTop}\\,${bandTop}+H*${bandFraction})\\,255\\,0)':cb=128:cr=128`
      + `[${input.stageId}-mask]`,
    `[${input.stageId}-base][${input.stageId}-band][${input.stageId}-mask]maskedmerge,`
      + `drawgrid=w=iw:h=${spacing}:y='mod(t*${lineSpeed},${spacing})':`
      + `t=1:c=black@${lineOpacity}[${input.stageId}-crt]`,
    `[${input.stageId}-clean][${input.stageId}-crt]blend=all_expr='${recipe.blend}'[${input.outputLabel}]`,
  ];
}

export function motionEchoFiltergraph(input: EffectFfmpegInput) {
  const decay = fixed(mix(0.86, 0.96, effectStrength(input.intensity)));
  const recipe = opticalFfmpegRecipe({
    intensity: input.intensity,
    duration: input.duration,
    fps: input.fps,
  });
  return [
    `[${input.inputLabel}]format=gbrp,split=2[${input.stageId}-clean][${input.stageId}-echo-source]`,
    `[${input.stageId}-echo-source]lagfun=decay=${decay}[${input.stageId}-trail]`,
    `[${input.stageId}-clean][${input.stageId}-trail]blend=all_expr='${recipe.blend}',`
      + `format=yuv444p[${input.outputLabel}]`,
  ];
}
