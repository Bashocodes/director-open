import { describe, expect, it } from 'vitest';
import { rippleDriftPlugin } from './rippleDrift';

function gradientPixels(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = Math.round(x / Math.max(1, width - 1) * 255);
      pixels[offset + 1] = Math.round(y / Math.max(1, height - 1) * 255);
      pixels[offset + 2] = (x * 13 + y * 7) % 256;
      pixels[offset + 3] = Math.round(80 + x / Math.max(1, width - 1) * 175);
    }
  }
  return pixels;
}

function difference(first: Uint8ClampedArray, second: Uint8ClampedArray) {
  let total = 0;
  for (let index = 0; index < first.length; index += 1) {
    total += Math.abs(first[index] - second[index]);
  }
  return total;
}

const active = {
  phase: 1,
  progress: 0.5,
  seed: 0.427,
  baseSeed: 0.4,
  frameIndex: 9,
  frameCount: 24,
  intensity: 90,
};

describe('ripple-drift structural effect', () => {
  it('is deterministic and never mutates its source, including alpha', () => {
    const source = gradientPixels(72, 96);
    const original = source.slice();
    const first = rippleDriftPlugin.renderFrame(source, 72, 96, active);
    const second = rippleDriftPlugin.renderFrame(source, 72, 96, active);

    expect(first).toEqual(second);
    expect(source).toEqual(original);
    expect(first).not.toBe(source);
    expect(first.filter((_, index) => index % 4 === 3)).not.toEqual(
      source.filter((_, index) => index % 4 === 3),
    );
  });

  it('returns a byte-for-byte clean copy at zero phase and loop endpoints', () => {
    const source = gradientPixels(32, 48);
    for (const options of [
      { ...active, phase: 0 },
      { ...active, progress: 0 },
      { ...active, progress: 1 },
    ]) {
      const output = rippleDriftPlugin.renderFrame(source, 32, 48, options);
      expect(output).toEqual(source);
      expect(output).not.toBe(source);
    }
  });

  it('increases displacement with the shared intensity curve', () => {
    const source = gradientPixels(96, 128);
    const low = rippleDriftPlugin.renderFrame(source, 96, 128, { ...active, intensity: 30 });
    const high = rippleDriftPlugin.renderFrame(source, 96, 128, { ...active, intensity: 90 });

    expect(difference(source, low)).toBeGreaterThan(0);
    expect(difference(source, high)).toBeGreaterThan(difference(source, low) * 1.25);
  });

  it('drifts continuously: nearby times differ but stay closer than distant times', () => {
    const source = gradientPixels(128, 160);
    const current = rippleDriftPlugin.renderFrame(source, 128, 160, active);
    const nearby = rippleDriftPlugin.renderFrame(source, 128, 160, {
      ...active,
      progress: 0.51,
      seed: active.seed + 0.003,
    });
    const distant = rippleDriftPlugin.renderFrame(source, 128, 160, {
      ...active,
      progress: 0.8,
      seed: active.seed + 0.06,
    });
    const nearbyDifference = difference(current, nearby);
    const distantDifference = difference(current, distant);

    expect(nearbyDifference).toBeGreaterThan(0);
    expect(nearbyDifference).toBeLessThan(distantDifference * 0.25);
  });
});
