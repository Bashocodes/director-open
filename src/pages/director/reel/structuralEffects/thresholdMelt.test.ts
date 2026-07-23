import { describe, expect, it } from 'vitest';
import { thresholdMeltPlugin } from './thresholdMelt';

function gradient(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = Math.round(255 * x / Math.max(1, width - 1));
      pixels.set([value, Math.min(255, value + y), Math.max(0, value - y), 80 + y], offset);
    }
  }
  return pixels;
}

const options = {
  phase: 1,
  progress: 0.5,
  seed: 0.423,
  baseSeed: 0.42,
  intensity: 90,
};

function delta(left: Uint8ClampedArray, right: Uint8ClampedArray) {
  return left.reduce((total, value, index) => total + Math.abs(value - right[index]), 0);
}

describe('threshold melt structural effect', () => {
  it('is deterministic, preserves alpha, and never mutates its source', () => {
    const source = gradient(48, 32);
    const original = source.slice();
    const first = thresholdMeltPlugin.renderFrame(source, 48, 32, options);
    const second = thresholdMeltPlugin.renderFrame(source, 48, 32, options);
    expect(first).toEqual(second);
    expect(source).toEqual(original);
    for (let offset = 3; offset < source.length; offset += 4) expect(first[offset]).toBe(source[offset]);
  });

  it('is exactly clean at zero phase and becomes a hard two-tone frame at peak intensity', () => {
    const source = gradient(64, 40);
    expect(thresholdMeltPlugin.renderFrame(source, 64, 40, { ...options, phase: 0 })).toEqual(source);
    const output = thresholdMeltPlugin.renderFrame(source, 64, 40, options);
    const colors = new Set<string>();
    for (let offset = 0; offset < output.length; offset += 4) {
      colors.add(`${output[offset]},${output[offset + 1]},${output[offset + 2]}`);
    }
    expect(colors).toEqual(new Set(['7,8,10', '246,242,231']));
  });

  it('scales the transformation with intensity and lets the threshold boundary crawl', () => {
    const source = gradient(72, 48);
    const low = thresholdMeltPlugin.renderFrame(source, 72, 48, { ...options, intensity: 30 });
    const high = thresholdMeltPlugin.renderFrame(source, 72, 48, options);
    const later = thresholdMeltPlugin.renderFrame(source, 72, 48, {
      ...options,
      progress: 0.58,
      seed: options.seed + 0.003,
    });
    expect(delta(source, high)).toBeGreaterThan(delta(source, low));
    expect(delta(high, later)).toBeGreaterThan(0);
  });
});
