import { describe, expect, it } from 'vitest';
import {
  isStructuralEffect,
  renderStructuralEffectFrame,
  renderStructuralEffectStackFrame,
  STRUCTURAL_EFFECT_IDS,
  structuralEffectPlugin,
} from './structuralEffects';

function portraitPixels(width: number, height: number) {
  return Uint8ClampedArray.from({ length: width * height * 4 }, (_, index) => {
    if (index % 4 === 3) return 255;
    return (index * 37 + Math.floor(index / 4) * 11) % 256;
  });
}

const active = {
  phase: 1,
  progress: 0.5,
  seed: 0.42,
  baseSeed: 0.42,
  frameIndex: 12,
  frameCount: 24,
  intensity: 72,
};

describe('structural effect registry', () => {
  it('registers pixel sort as the first shared renderFrame plugin', () => {
    expect(STRUCTURAL_EFFECT_IDS).toEqual([
      'pixel-sort',
      'glitch-burst',
      'halftone-reveal',
      'ripple-drift',
      'threshold-melt',
      'film-grain',
      'halation-bloom',
      'vignette-breathe',
      'anamorphic-streak',
      'chromatic-aberration',
      'tilt-shift',
      'light-leak',
      'neon-edge',
      'halftone-print',
    ]);
    expect(isStructuralEffect('pixel-sort')).toBe(true);
    expect(isStructuralEffect('glow')).toBe(false);
    expect(structuralEffectPlugin('pixel-sort').id).toBe('pixel-sort');
  });

  it('keeps endpoint frames byte-for-byte clean without mutating the source', () => {
    const source = portraitPixels(12, 16);
    const original = source.slice();
    for (const progress of [0, 1]) {
      const output = renderStructuralEffectFrame('pixel-sort', source, 12, 16, {
        ...active,
        progress,
      });
      expect(output).toEqual(original);
      expect(output).not.toBe(source);
    }
    expect(source).toEqual(original);
  });

  it('renders deterministically through both the single-plugin and stack paths', () => {
    const source = portraitPixels(36, 48);
    const first = renderStructuralEffectFrame('pixel-sort', source, 36, 48, active);
    const second = renderStructuralEffectFrame('pixel-sort', source, 36, 48, active);
    const stacked = renderStructuralEffectStackFrame(['pixel-sort'], source, 36, 48, active);
    expect(first).toEqual(second);
    expect(stacked).toEqual(first);
    expect(source).toEqual(portraitPixels(36, 48));
  });

  it('rejects mismatched RGBA dimensions before dispatch', () => {
    expect(() => renderStructuralEffectFrame(
      'pixel-sort',
      new Uint8ClampedArray(7),
      2,
      2,
      active,
    )).toThrow('dimensions do not match');
  });
});
