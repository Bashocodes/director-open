import { clamp01, effectStrength } from '../effectRecipes';
import type {
  StructuralEffectFrameOptions,
} from '../../../../plugins/types';

export type GlitchBurstSlice = {
  top: number;
  bottom: number;
  displacement: number;
  channelOffset: number;
};

export type GlitchBurstEvent = {
  startFrame: number;
  endFrame: number;
  fullFrame: boolean;
  slices: readonly GlitchBurstSlice[];
};

export type GlitchBurstSchedule = {
  frameCount: number;
  peakFrame: number;
  events: readonly GlitchBurstEvent[];
};

type Random = () => number;
const LOW_INTENSITY_STRENGTH = effectStrength(30);
const HIGH_INTENSITY_STRENGTH = effectStrength(90);

function makeRandom(seed: number, salt = 0): Random {
  let state = (Math.trunc(seed * 1_000_003) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomSign(random: Random) {
  return random() < 0.5 ? -1 : 1;
}

function allocateExtras(total: number, buckets: number, random: Random) {
  const extras = Array.from({ length: buckets }, () => 0);
  for (let index = 0; index < total; index += 1) {
    extras[Math.floor(random() * buckets)] += 1;
  }
  return extras;
}

function segmentCapacity(start: number, end: number) {
  const span = Math.max(0, end - start + 1);
  return Math.floor((span + 1) / 3);
}

function distributeEventCount(
  count: number,
  leftCapacity: number,
  rightCapacity: number,
  leftSpan: number,
  rightSpan: number,
) {
  const combinedSpan = Math.max(1, leftSpan + rightSpan);
  let left = Math.min(leftCapacity, Math.round(count * leftSpan / combinedSpan));
  let right = Math.min(rightCapacity, count - left);
  let remaining = count - left - right;
  while (remaining > 0 && (left < leftCapacity || right < rightCapacity)) {
    if (left < leftCapacity && (right >= rightCapacity || left / Math.max(1, leftCapacity) <= right / Math.max(1, rightCapacity))) {
      left += 1;
    } else {
      right += 1;
    }
    remaining -= 1;
  }
  return [left, right] as const;
}

function eventSlices(
  width: number,
  height: number,
  violence: number,
  random: Random,
): GlitchBurstSlice[] {
  const count = Math.max(3, Math.min(9, 3 + Math.round(6 * violence)));
  return Array.from({ length: count }, () => {
    const heightFraction = 0.02 + 0.1 * violence * (0.3 + random() * 0.7);
    const sliceHeight = Math.max(1, Math.min(height, Math.round(height * heightFraction)));
    const top = Math.floor(random() * Math.max(1, height - sliceHeight + 1));
    const displacementFraction = 0.01 + 0.05 * violence * (0.3 + random() * 0.7);
    const displacement = randomSign(random) * Math.max(1, Math.round(width * displacementFraction));
    const channelMagnitude = Math.round(width * 0.015 * violence * (0.25 + random() * 0.75));
    return {
      top,
      bottom: top + sliceHeight,
      displacement,
      channelOffset: randomSign(random) * channelMagnitude,
    };
  });
}

function fullFrameSlices(
  width: number,
  height: number,
  violence: number,
  random: Random,
): GlitchBurstSlice[] {
  const count = 9;
  const displacement = Math.max(1, Math.round(width * (0.01 + 0.05 * violence)));
  const channelOffset = Math.round(width * 0.015 * violence);
  return Array.from({ length: count }, (_, index) => ({
    top: Math.floor(index * height / count),
    bottom: Math.floor((index + 1) * height / count),
    displacement: randomSign(random) * displacement,
    channelOffset: randomSign(random) * channelOffset,
  }));
}

function scheduleSegment(
  start: number,
  end: number,
  count: number,
  width: number,
  height: number,
  violence: number,
  random: Random,
): GlitchBurstEvent[] {
  if (count <= 0 || end < start) return [];
  const span = end - start + 1;
  const maximumDuration = Math.max(2, Math.min(5, 2 + Math.ceil(3 * violence)));
  const durations = Array.from(
    { length: count },
    () => 2 + Math.floor(random() * (maximumDuration - 1)),
  );
  const minimumGapFrames = Math.max(0, count - 1);
  let overflow = durations.reduce((total, duration) => total + duration, minimumGapFrames) - span;
  while (overflow > 0) {
    const shrinkable = durations
      .map((duration, index) => (duration > 2 ? index : -1))
      .filter((index) => index >= 0);
    if (shrinkable.length === 0) break;
    const selected = shrinkable[Math.floor(random() * shrinkable.length)];
    durations[selected] -= 1;
    overflow -= 1;
  }
  const used = durations.reduce((total, duration) => total + duration, minimumGapFrames);
  const padding = allocateExtras(Math.max(0, span - used), count + 1, random);
  let cursor = start + padding[0];
  return durations.map((duration, index) => {
    const event: GlitchBurstEvent = {
      startFrame: cursor,
      endFrame: cursor + duration - 1,
      fullFrame: false,
      slices: eventSlices(width, height, violence, random),
    };
    cursor = event.endFrame + 2 + padding[index + 1];
    return event;
  });
}

/** Deterministic clip-wide event plan. The drifting per-frame seed never moves its event boundaries. */
export function glitchBurstSchedule(
  width: number,
  height: number,
  options: StructuralEffectFrameOptions,
): GlitchBurstSchedule {
  const frameCount = Math.max(4, Math.round(options.frameCount ?? 77));
  const peakFrame = Math.max(1, Math.min(frameCount - 2, Math.round((frameCount - 1) * 0.5)));
  const strength = effectStrength(options.intensity);
  if (strength <= 0) return { frameCount, peakFrame, events: [] };

  // The shared strength curve remains the only intensity input. Normalize its
  // 30→90 working range so the requested presets reach the sparse and violent endpoints.
  const violence = clamp01(
    (strength - LOW_INTENSITY_STRENGTH) / (HIGH_INTENSITY_STRENGTH - LOW_INTENSITY_STRENGTH),
  );
  const desiredEventCount = 8 + Math.round(6 * violence);
  // Leave a guaranteed clean recovery frame on both sides of the one-frame peak hit.
  const leftStart = 1;
  const leftEnd = peakFrame - 2;
  const rightStart = peakFrame + 2;
  const rightEnd = frameCount - 2;
  const leftCapacity = segmentCapacity(leftStart, leftEnd);
  const rightCapacity = segmentCapacity(rightStart, rightEnd);
  const regularCount = Math.min(desiredEventCount - 1, leftCapacity + rightCapacity);
  const [leftCount, rightCount] = distributeEventCount(
    regularCount,
    leftCapacity,
    rightCapacity,
    Math.max(0, leftEnd - leftStart + 1),
    Math.max(0, rightEnd - rightStart + 1),
  );
  const baseSeed = options.baseSeed ?? options.seed;
  const scheduleRandom = makeRandom(baseSeed, frameCount);
  const leftEvents = scheduleSegment(
    leftStart,
    leftEnd,
    leftCount,
    width,
    height,
    violence,
    scheduleRandom,
  );
  const peakRandom = makeRandom(baseSeed, 0x5045414b);
  const peakEvent: GlitchBurstEvent = {
    startFrame: peakFrame,
    endFrame: peakFrame,
    fullFrame: true,
    slices: fullFrameSlices(width, height, violence, peakRandom),
  };
  const rightEvents = scheduleSegment(
    rightStart,
    rightEnd,
    rightCount,
    width,
    height,
    violence,
    scheduleRandom,
  );
  return {
    frameCount,
    peakFrame,
    events: [...leftEvents, peakEvent, ...rightEvents],
  };
}

function clampCoordinate(value: number, maximum: number) {
  return Math.max(0, Math.min(maximum, value));
}

function renderEvent(
  sourceRgba: Uint8ClampedArray,
  width: number,
  height: number,
  event: GlitchBurstEvent,
) {
  const output = sourceRgba.slice();
  const maximumX = width - 1;
  event.slices.forEach((slice) => {
    const top = Math.max(0, slice.top);
    const bottom = Math.min(height, slice.bottom);
    for (let y = top; y < bottom; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sampledX = clampCoordinate(x - slice.displacement, maximumX);
        const redX = clampCoordinate(sampledX - slice.channelOffset, maximumX);
        const blueX = clampCoordinate(sampledX + slice.channelOffset, maximumX);
        const destination = (y * width + x) * 4;
        output[destination] = sourceRgba[(y * width + redX) * 4];
        output[destination + 1] = sourceRgba[(y * width + sampledX) * 4 + 1];
        output[destination + 2] = sourceRgba[(y * width + blueX) * 4 + 2];
        output[destination + 3] = sourceRgba[destination + 3];
      }
    }
  });
  return output;
}

export const glitchBurstPlugin = {
  id: 'glitch-burst' as const,
  renderFrame(
    sourceRgba: Uint8ClampedArray,
    width: number,
    height: number,
    options: StructuralEffectFrameOptions,
  ) {
    if (effectStrength(options.intensity) <= 0 || options.phase <= 0) return sourceRgba.slice();
    const schedule = glitchBurstSchedule(width, height, options);
    const frameIndex = Math.max(0, Math.min(
      schedule.frameCount - 1,
      Math.round(options.frameIndex ?? clamp01(options.progress) * (schedule.frameCount - 1)),
    ));
    const event = schedule.events.find(
      (candidate) => frameIndex >= candidate.startFrame && frameIndex <= candidate.endFrame,
    );
    return event ? renderEvent(sourceRgba, width, height, event) : sourceRgba.slice();
  },
};
