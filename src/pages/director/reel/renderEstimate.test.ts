import { describe, expect, it } from 'vitest';
import {
  estimateOutputBytes,
  estimateRenderSeconds,
  formatEstimatedBytes,
  formatEstimatedDuration,
} from './renderEstimate';

describe('estimateRenderSeconds', () => {
  /**
   * Anchored to the real 2026-07-25 measurement: a 12 s 9:16 reel at
   * 1080x1920 with one structural effect took roughly 13 minutes in Chrome.
   * If a future change moves this estimate far from the measurement, the
   * calibration constant is stale and the UI is lying to people.
   */
  it('lands near the measured 1080p reference render', () => {
    const seconds = estimateRenderSeconds({
      width: 1_080,
      height: 1_920,
      frameCount: 360,
      hasStructuralPass: true,
    });
    expect(seconds).toBeGreaterThan(9 * 60);
    expect(seconds).toBeLessThan(18 * 60);
  });

  it('scales down with pixel count', () => {
    const shared = { frameCount: 360, hasStructuralPass: false };
    const at1080 = estimateRenderSeconds({ width: 1_080, height: 1_920, ...shared });
    const at720 = estimateRenderSeconds({ width: 720, height: 1_280, ...shared });
    expect(at720).toBeLessThan(at1080);
    // 720p is 2.25x fewer pixels, so it should be roughly that much cheaper.
    expect(at1080 / at720).toBeCloseTo(2.25, 1);
  });

  it('charges more when a structural pass runs', () => {
    const base = { width: 720, height: 1_280, frameCount: 300 };
    expect(estimateRenderSeconds({ ...base, hasStructuralPass: true }))
      .toBeGreaterThan(estimateRenderSeconds({ ...base, hasStructuralPass: false }));
  });
});

describe('estimateOutputBytes', () => {
  it('lands near the measured 160.8 MB reference file', () => {
    const bytes = estimateOutputBytes({ quality: 'maximum', durationSeconds: 12 });
    const megabytes = bytes / 1_048_576;
    expect(megabytes).toBeGreaterThan(120);
    expect(megabytes).toBeLessThan(200);
  });

  it('orders qualities by size', () => {
    const at = (quality: 'draft' | 'balanced' | 'high' | 'maximum') =>
      estimateOutputBytes({ quality, durationSeconds: 10 });
    expect(at('draft')).toBeLessThan(at('balanced'));
    expect(at('balanced')).toBeLessThan(at('high'));
    expect(at('high')).toBeLessThan(at('maximum'));
  });

  it('scales linearly with duration', () => {
    const ten = estimateOutputBytes({ quality: 'balanced', durationSeconds: 10 });
    const twenty = estimateOutputBytes({ quality: 'balanced', durationSeconds: 20 });
    expect(twenty / ten).toBeCloseTo(2, 5);
  });
});

describe('formatting', () => {
  it('reads in seconds below a minute and minutes above', () => {
    expect(formatEstimatedDuration(20)).toMatch(/^~\d+s$/);
    expect(formatEstimatedDuration(300)).toBe('~5 min');
  });

  it('rounds long waits to a coarse bucket', () => {
    expect(formatEstimatedDuration(13 * 60)).toBe('~15 min');
  });

  it('handles nonsense input without producing a misleading number', () => {
    expect(formatEstimatedDuration(0)).toBe('—');
    expect(formatEstimatedDuration(Number.NaN)).toBe('—');
    expect(formatEstimatedBytes(-1)).toBe('—');
  });

  it('formats bytes at a readable scale', () => {
    expect(formatEstimatedBytes(160.8 * 1_048_576)).toBe('~161 MB');
    expect(formatEstimatedBytes(2 * 1_073_741_824)).toBe('~2.0 GB');
  });
});
