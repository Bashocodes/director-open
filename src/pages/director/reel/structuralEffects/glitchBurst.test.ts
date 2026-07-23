import { describe, expect, it } from 'vitest';
import {
  glitchBurstPlugin,
  glitchBurstSchedule,
  type GlitchBurstEvent,
} from './glitchBurst';

function testFrame(width: number, height: number) {
  const frame = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      frame[offset] = (x * 11 + y * 3) % 256;
      frame[offset + 1] = (x * 5 + y * 13) % 256;
      frame[offset + 2] = (x * 17 + y * 7) % 256;
      frame[offset + 3] = 255;
    }
  }
  return frame;
}

function options(frameIndex: number, intensity = 60, frameCount = 96) {
  return {
    phase: 1,
    progress: frameIndex / (frameCount - 1),
    seed: 0.42 + frameIndex * 0.003,
    baseSeed: 0.42,
    intensity,
    frameIndex,
    frameCount,
  };
}

function changedRows(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const rows = new Set<number>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        source[offset] !== output[offset]
        || source[offset + 1] !== output[offset + 1]
        || source[offset + 2] !== output[offset + 2]
      ) {
        rows.add(y);
        break;
      }
    }
  }
  return rows;
}

function ordinaryEvent(schedule: ReturnType<typeof glitchBurstSchedule>) {
  return schedule.events.find((event) => !event.fullFrame) as GlitchBurstEvent;
}

describe('glitch-burst structural effect', () => {
  it('is deterministic from the clip seed and never mutates its source', () => {
    const width = 96;
    const height = 72;
    const source = testFrame(width, height);
    const pristine = source.slice();
    const schedule = glitchBurstSchedule(width, height, options(0));
    const event = ordinaryEvent(schedule);
    const first = glitchBurstPlugin.renderFrame(source, width, height, options(event.startFrame));
    const second = glitchBurstPlugin.renderFrame(source, width, height, options(event.startFrame));
    expect(first).toEqual(second);
    expect(first).not.toEqual(source);
    expect(source).toEqual(pristine);
  });

  it('uses two-to-five-frame events with exact clean recovery gaps', () => {
    const width = 96;
    const height = 72;
    const source = testFrame(width, height);
    const schedule = glitchBurstSchedule(width, height, options(0));
    expect(schedule.events.length).toBeGreaterThanOrEqual(8);
    for (const event of schedule.events.filter((candidate) => !candidate.fullFrame)) {
      expect(event.endFrame - event.startFrame + 1).toBeGreaterThanOrEqual(2);
      expect(event.endFrame - event.startFrame + 1).toBeLessThanOrEqual(5);
    }
    for (let index = 1; index < schedule.events.length; index += 1) {
      expect(schedule.events[index].startFrame - schedule.events[index - 1].endFrame).toBeGreaterThan(1);
    }
    const occupied = new Set(schedule.events.flatMap((event) => (
      Array.from({ length: event.endFrame - event.startFrame + 1 }, (_, offset) => event.startFrame + offset)
    )));
    const recoveryFrame = Array.from({ length: schedule.frameCount - 2 }, (_, index) => index + 1)
      .find((frame) => !occupied.has(frame)) as number;
    expect(glitchBurstPlugin.renderFrame(source, width, height, options(recoveryFrame))).toEqual(source);
  });

  it('changes pixels only inside the scheduled horizontal slices during an ordinary event', () => {
    const width = 120;
    const height = 90;
    const source = testFrame(width, height);
    const schedule = glitchBurstSchedule(width, height, options(0));
    const event = ordinaryEvent(schedule);
    const output = glitchBurstPlugin.renderFrame(source, width, height, options(event.startFrame));
    const rows = changedRows(source, output, width, height);
    expect(rows.size).toBeGreaterThan(0);
    rows.forEach((row) => {
      expect(event.slices.some((slice) => row >= slice.top && row < slice.bottom)).toBe(true);
    });
    for (const slice of event.slices) {
      expect((slice.bottom - slice.top) / height).toBeGreaterThanOrEqual(0.02 - 1 / height);
      expect((slice.bottom - slice.top) / height).toBeLessThanOrEqual(0.12 + 1 / height);
      expect(Math.abs(slice.displacement) / width).toBeGreaterThanOrEqual(0.01 - 1 / width);
      expect(Math.abs(slice.displacement) / width).toBeLessThanOrEqual(0.06 + 1 / width);
      expect(Math.abs(slice.channelOffset) / width).toBeLessThanOrEqual(0.015 + 1 / width);
    }
  });

  it('scales event violence with intensity, recovers cleanly, and reserves one full-frame peak hit', () => {
    const width = 120;
    const height = 90;
    const source = testFrame(width, height);
    const low = glitchBurstSchedule(width, height, options(0, 30));
    const high = glitchBurstSchedule(width, height, options(0, 90));
    const ordinaryDisplacement = (schedule: typeof low) => schedule.events
      .filter((event) => !event.fullFrame)
      .flatMap((event) => event.slices)
      .reduce((total, slice) => total + Math.abs(slice.displacement), 0);
    expect(high.events.length).toBeGreaterThan(low.events.length);
    expect(ordinaryDisplacement(high)).toBeGreaterThan(ordinaryDisplacement(low));

    const peakHits = high.events.filter((event) => event.fullFrame);
    expect(peakHits).toHaveLength(1);
    expect(peakHits[0].startFrame).toBe(peakHits[0].endFrame);
    const peakOutput = glitchBurstPlugin.renderFrame(
      source,
      width,
      height,
      options(peakHits[0].startFrame, 90),
    );
    expect(changedRows(source, peakOutput, width, height).size).toBe(height);
    expect(glitchBurstPlugin.renderFrame(
      source,
      width,
      height,
      options(peakHits[0].startFrame - 1, 90),
    )).toEqual(source);
    expect(glitchBurstPlugin.renderFrame(
      source,
      width,
      height,
      options(peakHits[0].startFrame + 1, 90),
    )).toEqual(source);
  });
});
