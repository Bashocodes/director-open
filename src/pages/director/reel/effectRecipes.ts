export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function mix(low: number, high: number, amount: number) {
  return low + (high - low) * clamp01(amount);
}

export function effectStrength(intensity: number) {
  const amount = clamp01(intensity / 100);
  return amount <= 0 ? 0 : Math.pow(amount, 0.45);
}

export type PremiumLoopFrameBoundaries = {
  frameCount: number;
  leadEndFrame: number;
  riseEndFrame: number;
  holdEndFrame: number;
  fallEndFrame: number;
  leadFrames: number;
  riseFrames: number;
  holdFrames: number;
  fallFrames: number;
  tailFrames: number;
};

const PREMIUM_LEAD_SECONDS = 0.5;
const PREMIUM_RAMP_SECONDS = 1.2;
const PREMIUM_TAIL_SECONDS = 0.25;

/** One frame-quantized timing plan shared by preview sampling and FFmpeg expressions. */
export function premiumLoopFrameBoundaries(duration: number, fps: number): PremiumLoopFrameBoundaries {
  const safeFps = Math.max(1, Number.isFinite(fps) ? fps : 1);
  const frameCount = Math.max(4, Math.round(Math.max(0, duration) * safeFps));
  let leadFrames = Math.max(1, Math.round(PREMIUM_LEAD_SECONDS * safeFps));
  let tailFrames = Math.max(1, Math.round(PREMIUM_TAIL_SECONDS * safeFps));
  if (leadFrames + tailFrames > frameCount - 2) {
    const cleanScale = (frameCount - 2) / Math.max(1, leadFrames + tailFrames);
    leadFrames = Math.max(1, Math.floor(leadFrames * cleanScale));
    tailFrames = Math.max(1, frameCount - 2 - leadFrames);
  }
  const rampBudget = Math.max(2, frameCount - leadFrames - tailFrames);
  const targetRampFrames = Math.max(2, Math.round(PREMIUM_RAMP_SECONDS * safeFps));
  const pairedRampFrames = Math.min(rampBudget, targetRampFrames * 2);
  const riseFrames = Math.max(1, Math.floor(pairedRampFrames / 2));
  const fallFrames = Math.max(1, pairedRampFrames - riseFrames);
  const holdFrames = Math.max(0, rampBudget - riseFrames - fallFrames);
  const leadEndFrame = leadFrames;
  const riseEndFrame = leadEndFrame + riseFrames;
  const holdEndFrame = riseEndFrame + holdFrames;
  const fallEndFrame = holdEndFrame + fallFrames;
  return {
    frameCount,
    leadEndFrame,
    riseEndFrame,
    holdEndFrame,
    fallEndFrame,
    leadFrames,
    riseFrames,
    holdFrames,
    fallFrames,
    tailFrames,
  };
}

function smoothstep(value: number) {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
}

export function premiumLoopEnvelopeAtFrame(frame: number, timing: PremiumLoopFrameBoundaries) {
  const index = Math.max(0, Math.min(timing.frameCount - 1, Math.round(frame)));
  if (index < timing.leadEndFrame) return 0;
  if (index < timing.riseEndFrame) {
    return smoothstep((index - timing.leadEndFrame) / Math.max(1, timing.riseFrames - 1));
  }
  if (index < timing.holdEndFrame) return 1;
  if (index < timing.fallEndFrame) {
    return smoothstep(1 - (index - timing.holdEndFrame) / Math.max(1, timing.fallFrames - 1));
  }
  return 0;
}

/** A clean hold → reveal → peak hold → recover envelope in absolute time. */
export function premiumLoopEnvelope(progress: number, duration: number, fps: number) {
  const timing = premiumLoopFrameBoundaries(duration, fps);
  return premiumLoopEnvelopeAtFrame(clamp01(progress) * (timing.frameCount - 1), timing);
}

export function deterministicHash(value: number) {
  const raw = Math.sin(value * 12.9898) * 43_758.5453;
  return ((raw - Math.floor(raw)) * 2) - 1;
}

export function effectSeed(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

function fixed(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function structuralEffectFps(outputFps: number) {
  return Math.max(1, outputFps / 2);
}

export function structuralEffectFrameCount(duration: number, outputFps: number) {
  return Math.max(1, Math.ceil(Math.max(0, duration) * structuralEffectFps(outputFps)));
}

export function structuralEffectPhase(
  frameIndex: number,
  frameCount: number,
  duration: number,
  outputFps: number,
) {
  const progress = Math.max(0, Math.min(frameCount - 1, frameIndex)) / Math.max(1, frameCount - 1);
  return premiumLoopEnvelope(progress, duration, outputFps);
}

export function structuralEffectSeed(seed: number, frameIndex: number) {
  return seed + Math.max(0, frameIndex) * 0.003;
}

export type StructuralEffectSample = {
  frameRate: number;
  frameCount: number;
  frameIndex: number;
  progress: number;
  phase: number;
  seed: number;
};

/** One half-rate sample shared by structural sequence baking and live preview playback. */
export function structuralEffectSampleAtFrame(
  frameIndex: number,
  duration: number,
  outputFps: number,
  seed: number,
): StructuralEffectSample {
  const frameRate = structuralEffectFps(outputFps);
  const frameCount = structuralEffectFrameCount(duration, outputFps);
  const boundedFrameIndex = Math.max(0, Math.min(frameCount - 1, Math.floor(frameIndex)));
  const progress = boundedFrameIndex / Math.max(1, frameCount - 1);
  return {
    frameRate,
    frameCount,
    frameIndex: boundedFrameIndex,
    progress,
    phase: structuralEffectPhase(boundedFrameIndex, frameCount, duration, outputFps),
    seed: structuralEffectSeed(seed, boundedFrameIndex),
  };
}

/** Select the half-rate structural frame FFmpeg duplicates at this clip time. */
export function structuralEffectSampleAtProgress(
  progress: number,
  duration: number,
  outputFps: number,
  seed: number,
) {
  const frameRate = structuralEffectFps(outputFps);
  const frameCount = structuralEffectFrameCount(duration, outputFps);
  const elapsed = clamp01(progress) * Math.max(0, duration);
  const frameIndex = Math.min(frameCount - 1, Math.floor(elapsed * frameRate + 1e-7));
  return structuralEffectSampleAtFrame(frameIndex, duration, outputFps, seed);
}

// Compatibility names retained for the pixel-sort prototype and external callers.
export const pixelSortMorphologyFps = structuralEffectFps;
export const pixelSortMorphologyFrameCount = structuralEffectFrameCount;
export const pixelSortMorphologyPhase = structuralEffectPhase;
export const pixelSortMorphologySeed = structuralEffectSeed;
export type PixelSortMorphologySample = StructuralEffectSample;
export const pixelSortMorphologySampleAtFrame = structuralEffectSampleAtFrame;
export const pixelSortMorphologySampleAtProgress = structuralEffectSampleAtProgress;

export function premiumLoopFfmpegEnvelope(duration: number, fps: number) {
  const timing = premiumLoopFrameBoundaries(duration, fps);
  const riseProgress = `(N-${timing.leadEndFrame})/${Math.max(1, timing.riseFrames - 1)}`;
  const fallProgress = `1-(N-${timing.holdEndFrame})/${Math.max(1, timing.fallFrames - 1)}`;
  const rise = `(${riseProgress})*(${riseProgress})*(3-2*(${riseProgress}))`;
  const fall = `(${fallProgress})*(${fallProgress})*(3-2*(${fallProgress}))`;
  return `if(lt(N,${timing.leadEndFrame}),0,`
    + `if(lt(N,${timing.riseEndFrame}),${rise},`
    + `if(lt(N,${timing.holdEndFrame}),1,`
    + `if(lt(N,${timing.fallEndFrame}),${fall},0))))`;
}

/** A simple clean → peak → clean envelope for any two-plate optical effect. */
export function opticalFfmpegRecipe(options: {
  intensity: number;
  duration: number;
  fps: number;
  power?: number;
}) {
  const strength = effectStrength(options.intensity);
  const envelope = `${fixed(strength)}*(${premiumLoopFfmpegEnvelope(options.duration, options.fps)})`;
  return { envelope, blend: `A+(${envelope})*(B-A)` };
}

export function premiumPulse(progress: number, intensity: number, duration: number, fps: number) {
  return premiumLoopEnvelope(progress, duration, fps) * effectStrength(intensity);
}
