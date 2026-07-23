import { describe, expect, it } from 'vitest';
import { pixelSortRgba } from './pixelSortEngine';

function intervalFrame(width: number, height: number, strongFeature = false) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const wave = (Math.sin(x * 0.075 + y * 0.031) + 1) * 0.5;
      let value = 17 + Math.round(wave * 166);
      if (strongFeature && Math.abs(x - Math.floor(width / 2)) <= 2) value = 220;
      pixels[offset] = value;
      pixels[offset + 1] = Math.min(255, value + 5);
      pixels[offset + 2] = Math.max(0, value - 4);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function pixelChanged(source: Uint8ClampedArray, output: Uint8ClampedArray, pixel: number) {
  const offset = pixel * 4;
  return output[offset] !== source[offset]
    || output[offset + 1] !== source[offset + 1]
    || output[offset + 2] !== source[offset + 2];
}

describe('true interval pixel-sort engine', () => {
  it('is deterministic and changes intervals across every outer frame band', () => {
    const width = 360;
    const height = 180;
    const source = intervalFrame(width, height);
    const first = pixelSortRgba(source, width, height, { intensity: 100, seed: 0.42 });
    const second = pixelSortRgba(source, width, height, { intensity: 100, seed: 0.42 });
    expect(first).toEqual(second);
    expect(first).not.toEqual(source);

    const bandWidth = Math.ceil(width * 0.05);
    const bandHeight = Math.ceil(height * 0.05);
    const changes = { left: 0, right: 0, top: 0, bottom: 0 };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!pixelChanged(source, first, y * width + x)) continue;
        if (x < bandWidth) changes.left += 1;
        if (x >= width - bandWidth) changes.right += 1;
        if (y < bandHeight) changes.top += 1;
        if (y >= height - bandHeight) changes.bottom += 1;
      }
    }
    expect(changes.left).toBeGreaterThan(0);
    expect(changes.right).toBeGreaterThan(0);
    expect(changes.top).toBeGreaterThan(0);
    expect(changes.bottom).toBeGreaterThan(0);
  });

  it('returns the source unchanged at zero strength', () => {
    const source = intervalFrame(64, 24);
    expect(pixelSortRgba(source, 64, 24, { intensity: 0, seed: 0.2 })).toEqual(source);
  });

  it('sorts near-dark pixels while anchoring a strong structural edge', () => {
    const width = 320;
    const height = 120;
    const featureX = Math.floor(width / 2);
    const source = intervalFrame(width, height, true);
    const output = pixelSortRgba(source, width, height, { intensity: 100, seed: 0.42 });
    let changedDarkPixels = 0;
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      if (source[pixel * 4] <= 63 && pixelChanged(source, output, pixel)) changedDarkPixels += 1;
    }
    expect(changedDarkPixels).toBeGreaterThan(0);
    for (let y = 1; y < height - 1; y += 1) {
      for (const x of [featureX - 3, featureX - 2, featureX + 2, featureX + 3]) {
        expect(pixelChanged(source, output, y * width + x)).toBe(false);
      }
    }
  });

  it('builds progressively broader morphology plates instead of opacity-only copies', () => {
    const width = 360;
    const height = 180;
    const source = intervalFrame(width, height);
    const changedPixels = (phase: number) => {
      const output = pixelSortRgba(source, width, height, { intensity: 90, seed: 0.42, phase });
      let changed = 0;
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        if (pixelChanged(source, output, pixel)) changed += 1;
      }
      return changed;
    };
    const fracture = changedPixels(0.18);
    const streak = changedPixels(0.5);
    const peak = changedPixels(0.88);
    expect(streak).toBeGreaterThan(fracture);
    expect(peak).toBeGreaterThan(streak);
    expect(peak).toBeGreaterThan(0);
  });
});
