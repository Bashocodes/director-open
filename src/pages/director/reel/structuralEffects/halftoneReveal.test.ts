import { describe, expect, it } from 'vitest';
import { halftoneCellSize, halftoneRevealPlugin } from './halftoneReveal';

function colorFrame(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = (x * 13 + y * 3) % 256;
      pixels[offset + 1] = (x * 5 + y * 11 + 37) % 256;
      pixels[offset + 2] = (x * 7 + y * 17 + 91) % 256;
      pixels[offset + 3] = (x * 19 + y * 23) % 256;
    }
  }
  return pixels;
}

const peak = {
  phase: 1,
  progress: 0.5,
  seed: 0.42,
  intensity: 100,
};

describe('halftone reveal structural effect', () => {
  it('is deterministic, leaves its source immutable, and preserves every alpha byte', () => {
    const source = colorFrame(96, 128);
    const original = source.slice();
    const first = halftoneRevealPlugin.renderFrame(source, 96, 128, peak);
    const second = halftoneRevealPlugin.renderFrame(source, 96, 128, peak);

    expect(first).toEqual(second);
    expect(source).toEqual(original);
    expect(first).not.toBe(source);
    for (let offset = 3; offset < first.length; offset += 4) {
      expect(first[offset]).toBe(source[offset]);
    }
  });

  it('grows from a fine onset grid to intensity-scaled bold peak dots', () => {
    expect(halftoneCellSize(1080, 0, 90)).toBe(2);
    expect(halftoneCellSize(1080, 1, 30)).toBeGreaterThanOrEqual(8);
    expect(halftoneCellSize(1080, 1, 90)).toBeGreaterThan(
      halftoneCellSize(1080, 1, 30),
    );
    expect(halftoneCellSize(540, 1, 90)).toBe(
      Math.round(halftoneCellSize(1080, 1, 90) / 2),
    );
  });

  it('becomes an unmistakable monochrome dot rendering at full peak', () => {
    const width = 180;
    const height = 240;
    const source = colorFrame(width, height);
    const output = halftoneRevealPlugin.renderFrame(source, width, height, peak);
    let changedPixels = 0;
    const tones = new Set<number>();

    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      expect(output[offset]).toBe(output[offset + 1]);
      expect(output[offset + 1]).toBe(output[offset + 2]);
      tones.add(output[offset]);
      if (output[offset] !== source[offset]
        || output[offset + 1] !== source[offset + 1]
        || output[offset + 2] !== source[offset + 2]) {
        changedPixels += 1;
      }
    }

    expect([...tones].sort((a, b) => a - b)).toEqual([12, 246]);
    expect(changedPixels / (width * height)).toBeGreaterThan(0.98);
  });

  it('keeps a zero-intensity frame byte-for-byte clean', () => {
    const source = colorFrame(32, 48);
    const output = halftoneRevealPlugin.renderFrame(source, 32, 48, {
      ...peak,
      intensity: 0,
    });
    expect(output).toEqual(source);
    expect(output).not.toBe(source);
  });
});
