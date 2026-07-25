import { describe, expect, it } from 'vitest';
import {
  effectPhaseAt,
  peakEffectProgress,
  stillDimensions,
  stillFileName,
  STILL_FORMATS,
  STILL_SIZES,
} from './stillExport';
import type { ReelClip } from './types';

function clip(overrides: Partial<ReelClip> = {}): ReelClip {
  return {
    id: 'clip-1',
    objectId: null,
    title: 'Test clip',
    imageUrl: 'blob:test',
    duration: 3.2,
    effect: 'clean',
    visualEffect: 'none',
    transition: 'cut',
    transitionDuration: 0,
    motion: 'push-in',
    intensity: 60,
    textLayers: [],
    ...overrides,
  };
}

const size = (id: string) => {
  const entry = STILL_SIZES.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown still size: ${id}`);
  return entry;
};

describe('stillDimensions', () => {
  it('builds a 9:16 frame from the requested short edge', () => {
    expect(stillDimensions({
      aspectRatio: '9:16',
      size: size('reel'),
      sourceWidth: 4_000,
      sourceHeight: 4_000,
    })).toEqual({ width: 1_080, height: 1_920 });
  });

  it('builds a 16:9 frame from the requested short edge', () => {
    expect(stillDimensions({
      aspectRatio: '16:9',
      size: size('reel'),
      sourceWidth: 4_000,
      sourceHeight: 4_000,
    })).toEqual({ width: 1_920, height: 1_080 });
  });

  it('builds a square frame', () => {
    expect(stillDimensions({
      aspectRatio: '1:1',
      size: size('square-2048'),
      sourceWidth: 4_000,
      sourceHeight: 4_000,
    })).toEqual({ width: 2_048, height: 2_048 });
  });

  it('never upscales past the source when following the source resolution', () => {
    // A 1648x2944 portrait cropped to 9:16 is limited by its width.
    const result = stillDimensions({
      aspectRatio: '9:16',
      size: size('source'),
      sourceWidth: 1_648,
      sourceHeight: 2_944,
    });
    expect(result.width).toBe(1_648);
    expect(result.height).toBe(Math.round(1_648 * 16 / 9));
    expect(result.height).toBeLessThanOrEqual(2_944);
  });

  it('uses the full height when a wide source is cropped to 9:16', () => {
    const result = stillDimensions({
      aspectRatio: '9:16',
      size: size('source'),
      sourceWidth: 4_000,
      sourceHeight: 1_000,
    });
    // Height is the binding edge; the frame may not exceed what the source holds.
    expect(result.width).toBeLessThanOrEqual(4_000);
    expect(result.width / result.height).toBeCloseTo(9 / 16, 2);
  });

  it('clamps absurd frames to the canvas ceiling', () => {
    const result = stillDimensions({
      aspectRatio: '16:9',
      size: size('print-4096'),
      sourceWidth: 40_000,
      sourceHeight: 40_000,
    });
    expect(result.width).toBeLessThanOrEqual(8_192);
    expect(result.height).toBeLessThanOrEqual(8_192);
  });

  it('keeps the requested aspect ratio for every listed size', () => {
    for (const entry of STILL_SIZES) {
      const result = stillDimensions({
        aspectRatio: '9:16',
        size: entry,
        sourceWidth: 3_000,
        sourceHeight: 5_000,
      });
      expect(result.width / result.height).toBeCloseTo(9 / 16, 2);
    }
  });
});

describe('stillFileName', () => {
  it('slugifies a clip title and drops the source extension', () => {
    expect(stillFileName('Colossal Aerial Panorama.png', 'jpg'))
      .toBe('colossal-aerial-panorama.jpg');
  });

  it('falls back when a title has no usable characters', () => {
    expect(stillFileName('***', 'png')).toBe('director-still.png');
  });

  it('bounds the length of very long titles', () => {
    const name = stillFileName('x'.repeat(400), 'webp');
    expect(name.length).toBeLessThanOrEqual(65);
    expect(name.endsWith('.webp')).toBe(true);
  });
});

describe('effect phase', () => {
  const withEffect = clip({ visualEffect: 'halftone-print', visualEffectStack: ['halftone-print'] });

  it('reports nothing for a clip with no visual effect', () => {
    expect(effectPhaseAt(clip(), 0.5, 30)).toBeNull();
  });

  it('is dormant at the very start and end of a clip', () => {
    // This is why the panel warns: a still captured here would lose the effect.
    expect(effectPhaseAt(withEffect, 0, 30)!).toBeLessThan(0.05);
    expect(effectPhaseAt(withEffect, 1, 30)!).toBeLessThan(0.05);
  });

  it('is at full strength somewhere in the middle', () => {
    expect(effectPhaseAt(withEffect, 0.5, 30)!).toBeGreaterThan(0.9);
  });

  it('finds a peak where the effect is actually active', () => {
    const peak = peakEffectProgress(withEffect, 30);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(1);
    expect(effectPhaseAt(withEffect, peak, 30)!).toBeGreaterThan(0.9);
  });

  it('returns a usable progress even for a clip with no effect', () => {
    const peak = peakEffectProgress(clip(), 30);
    expect(peak).toBeGreaterThanOrEqual(0);
    expect(peak).toBeLessThanOrEqual(1);
  });
});

describe('still export catalog', () => {
  it('exposes unique size and format ids', () => {
    expect(new Set(STILL_SIZES.map((entry) => entry.id)).size).toBe(STILL_SIZES.length);
    expect(new Set(STILL_FORMATS.map((entry) => entry.id)).size).toBe(STILL_FORMATS.length);
  });

  it('gives every format a file extension', () => {
    for (const entry of STILL_FORMATS) {
      expect(entry.extension).toMatch(/^[a-z]+$/);
    }
  });
});
