export const DIRECTOR_BEAT_SYNC_VERSION = 1;

export type DirectorBeatEvent = {
  frame: number;
  timeSeconds: number;
  strength: number;
};

export type DirectorBeatSyncPlan = {
  version: typeof DIRECTOR_BEAT_SYNC_VERSION;
  fps: 24 | 30;
  durationSeconds: number;
  frameCount: number;
  analysis: {
    source: 'decoded-audio-energy';
    windowSamples: number;
    hopSamples: number;
    threshold: number;
    minimumGapFrames: number;
  };
  beats: DirectorBeatEvent[];
};

export type DirectorBeatSyncOptions = {
  threshold?: number;
  minimumGapFrames?: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rms(samples: ArrayLike<number>, start: number, end: number) {
  if (end <= start) return 0;
  let sum = 0;
  for (let index = start; index < end; index += 1) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / (end - start));
}

/**
 * Detects frame-quantized energy peaks without a third-party beat library.
 * The same compact event shape can be sent to FFmpeg as a frame map or to AE
 * as markers; the Adobe bridge may instead choose AE's native amplitude source.
 */
export function buildDirectorBeatSyncPlan(
  samples: ArrayLike<number>,
  sampleRate: number,
  fps: 24 | 30,
  durationSeconds: number,
  options: DirectorBeatSyncOptions = {},
): DirectorBeatSyncPlan {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Beat analysis needs a positive sample rate.');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Beat analysis needs a positive duration.');
  const frameCount = Math.max(1, Math.ceil(durationSeconds * fps));
  const samplesPerFrame = Math.max(1, Math.round(sampleRate / fps));
  const energies = Array.from({ length: frameCount }, (_, frame) => (
    rms(samples, frame * samplesPerFrame, Math.min(samples.length, (frame + 1) * samplesPerFrame))
  ));
  const nonZero = energies.filter((energy) => energy > 0).sort((a, b) => a - b);
  const median = nonZero.length === 0 ? 0 : nonZero[Math.floor(nonZero.length / 2)] ?? 0;
  const mean = energies.reduce((sum, value) => sum + value, 0) / energies.length;
  const baseline = Math.max(0.000_001, Math.min(median || mean, mean || median || 1));
  const threshold = clamp(options.threshold ?? 1.35, 1, 4);
  const minimumGapFrames = Math.max(1, Math.round(options.minimumGapFrames ?? fps / 8));
  const maximumEnergy = Math.max(baseline, ...energies);
  const beats: DirectorBeatEvent[] = [];
  let lastFrame = -minimumGapFrames;
  for (let frame = 1; frame < energies.length - 1; frame += 1) {
    const energy = energies[frame] ?? 0;
    if (energy < baseline * threshold || energy < (energies[frame - 1] ?? 0) || energy < (energies[frame + 1] ?? 0)) continue;
    if (frame - lastFrame < minimumGapFrames) continue;
    lastFrame = frame;
    beats.push({
      frame,
      timeSeconds: frame / fps,
      strength: clamp((energy - baseline) / Math.max(0.000_001, maximumEnergy - baseline), 0, 1),
    });
  }
  return {
    version: DIRECTOR_BEAT_SYNC_VERSION,
    fps,
    durationSeconds,
    frameCount,
    analysis: {
      source: 'decoded-audio-energy',
      windowSamples: samplesPerFrame,
      hopSamples: samplesPerFrame,
      threshold,
      minimumGapFrames,
    },
    beats,
  };
}

export function beatAtFrame(plan: DirectorBeatSyncPlan, frame: number) {
  return plan.beats.find((beat) => beat.frame === frame) ?? null;
}
