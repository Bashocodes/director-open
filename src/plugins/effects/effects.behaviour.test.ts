import { describe, expect, it } from 'vitest';
import { pluginRegistry, resolvedPluginParams } from '../registry';
import type { AnyEffectPlugin } from '../types';

/**
 * Behaviour tests for the effect library.
 *
 * The golden test proves the effects are deterministic; it would happily pass
 * on an effect that did the wrong thing consistently. These assert the visible
 * claim each plugin's description makes.
 */

const W = 48;
const H = 48;

/** Mid-grey field with a single bright square near the top-right. */
function fieldWithHighlight(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4;
      const bright = x >= 34 && x <= 38 && y >= 10 && y <= 14;
      const value = bright ? 255 : 60;
      out[o] = value;
      out[o + 1] = value;
      out[o + 2] = value;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Vertical black/white split — a single hard edge down the middle. */
function verticalEdge(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4;
      const value = x < W / 2 ? 20 : 235;
      out[o] = value;
      out[o + 1] = value;
      out[o + 2] = value;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Fine checkerboard: maximal high-frequency detail for blur assertions. */
function checkerboard(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4;
      const value = (x + y) % 2 === 0 ? 240 : 15;
      out[o] = value;
      out[o + 1] = value;
      out[o + 2] = value;
      out[o + 3] = 255;
    }
  }
  return out;
}

function run(
  id: string,
  source: Uint8ClampedArray,
  params: Record<string, unknown> = {},
  intensity = 80,
  width = W,
  height = H,
): Uint8ClampedArray {
  const plugin = pluginRegistry.getEffect(id, 'visual') as AnyEffectPlugin | undefined;
  if (!plugin?.frameTransform) throw new Error(`${id} has no frameTransform`);
  return plugin.frameTransform({
    sourceRgba: source,
    width,
    height,
    phase: 1,
    progress: 0.5,
    seed: 99,
    intensity,
    frameIndex: 1,
    frameCount: 4,
    baseSeed: 99,
    params: resolvedPluginParams(plugin, params, { intensity }),
  });
}

const at = (frame: Uint8ClampedArray, x: number, y: number, c = 0) => frame[(y * W + x) * 4 + c];

/** Mean absolute difference between neighbouring pixels — a proxy for sharpness. */
function localContrast(frame: Uint8ClampedArray, fromY: number, toY: number): number {
  let total = 0;
  let count = 0;
  for (let y = fromY; y < toY; y += 1) {
    for (let x = 0; x < W - 1; x += 1) {
      total += Math.abs(at(frame, x, y) - at(frame, x + 1, y));
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

const NEW_EFFECTS = [
  'anamorphic-streak',
  'chromatic-aberration',
  'tilt-shift',
  'light-leak',
  'neon-edge',
  'halftone-print',
];

describe('effect library contract', () => {
  it.each(NEW_EFFECTS)('%s is registered as a pre-motion visual effect', (id) => {
    const plugin = pluginRegistry.getEffect(id, 'visual');
    expect(plugin, `${id} is not registered`).toBeTruthy();
    expect(plugin!.stage).toBe('pre-motion');
    expect(plugin!.description.trim().length).toBeGreaterThan(10);
  });

  it.each(NEW_EFFECTS)('%s is a no-op at zero strength', (id) => {
    const src = fieldWithHighlight();
    const out = run(id, src, { intensity: 0 }, 0);
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  it.each(NEW_EFFECTS)('%s never mutates the source buffer', (id) => {
    const src = fieldWithHighlight();
    const before = Array.from(src);
    run(id, src);
    expect(Array.from(src)).toEqual(before);
  });

  it.each(NEW_EFFECTS)('%s leaves alpha fully opaque', (id) => {
    const out = run(id, fieldWithHighlight());
    for (let p = 0; p < W * H; p += 1) {
      expect(out[p * 4 + 3]).toBe(255);
    }
  });
});

describe('resolution independence', () => {
  /**
   * Every effect declares that spatial values are fractions of the frame, so
   * the same settings must produce the same *look* at any size. This renders
   * one scene at two resolutions and compares the average change each effect
   * makes. A gain keyed to pixel counts rather than frame fractions — the bug
   * that shipped in anamorphic-streak's first version — fails here.
   */
  function highlightScene(width: number, height: number): Uint8ClampedArray {
    const out = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const o = (y * width + x) * 4;
        const nx = x / width;
        const ny = y / height;
        // A bright disc at the same relative position in both renders.
        const bright = Math.hypot(nx - 0.68, ny - 0.3) < 0.06;
        const value = bright ? 255 : 40 + Math.round(60 * nx);
        out[o] = value;
        out[o + 1] = value;
        out[o + 2] = value;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  /** Mean absolute change the effect makes, as a fraction of full scale. */
  function meanChange(source: Uint8ClampedArray, output: Uint8ClampedArray) {
    let total = 0;
    let count = 0;
    for (let i = 0; i < source.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        total += Math.abs(output[i + c] - source[i + c]);
        count += 1;
      }
    }
    return total / count / 255;
  }

  /*
   * Bounds calibrated against measurement, not guessed. Across a 6x span every
   * correct effect lands between 0.89 and 1.01; the pixel-keyed gain that
   * shipped in anamorphic-streak's first version measured 1.34. A loose
   * tolerance would have let that through, so these are deliberately tight.
   */
  it.each(NEW_EFFECTS)('%s behaves the same at 256px and 1536px wide', (id) => {
    const small = highlightScene(256, 256);
    const large = highlightScene(1_536, 1_536);
    const smallChange = meanChange(small, run(id, small, {}, 70, 256, 256));
    const largeChange = meanChange(large, run(id, large, {}, 70, 1_536, 1_536));
    const ratio = largeChange / smallChange;
    expect(ratio).toBeGreaterThan(0.82);
    expect(ratio).toBeLessThan(1.18);
  });
});

describe('anamorphic-streak', () => {
  // The highlight sits at x 34..38, y 10..14. At length 0.2 on a 48px frame the
  // horizontal blur radius is 10px, so the streak reaches x 24..48 on those
  // rows and essentially nothing one row-set away. Probe 8px out on each axis.
  const SIDE = { x: 28, y: 12 };
  const ABOVE = { x: 36, y: 20 };

  it('spreads the highlight horizontally, not vertically', () => {
    const out = run('anamorphic-streak', fieldWithHighlight(), { length: 0.2, threshold: 50 });
    const src = fieldWithHighlight();
    const sideGain = at(out, SIDE.x, SIDE.y) - at(src, SIDE.x, SIDE.y);
    const aboveGain = at(out, ABOVE.x, ABOVE.y) - at(src, ABOVE.x, ABOVE.y);
    expect(sideGain).toBeGreaterThan(4);
    expect(sideGain).toBeGreaterThan(aboveGain * 3);
  });

  it('biases the flare toward blue', () => {
    const out = run('anamorphic-streak', fieldWithHighlight(), { length: 0.2, threshold: 50, tint: 100 });
    const src = fieldWithHighlight();
    const blueGain = at(out, SIDE.x, SIDE.y, 2) - at(src, SIDE.x, SIDE.y, 2);
    const redGain = at(out, SIDE.x, SIDE.y, 0) - at(src, SIDE.x, SIDE.y, 0);
    expect(blueGain).toBeGreaterThan(redGain);
  });
});

describe('chromatic-aberration', () => {
  /*
   * The displacement is a fraction of the frame, not a fixed pixel count — the
   * point is that the look holds at any resolution. On a 48px test frame the
   * corner shift is ~0.2px and invisible, so these run at a realistic width.
   */
  const CW = 512;
  const CH = 512;

  function wideVerticalEdge(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(CW * CH * 4);
    for (let y = 0; y < CH; y += 1) {
      for (let x = 0; x < CW; x += 1) {
        const o = (y * CW + x) * 4;
        // Several stripes so an edge exists near the corners, not just mid-frame.
        const value = Math.floor(x / 32) % 2 === 0 ? 20 : 235;
        out[o] = value;
        out[o + 1] = value;
        out[o + 2] = value;
        out[o + 3] = 255;
      }
    }
    return out;
  }

  const wideAt = (frame: Uint8ClampedArray, x: number, y: number, c = 0) => frame[(y * CW + x) * 4 + c];

  it('leaves the optical centre untouched and fringes the corners', () => {
    const src = wideVerticalEdge();
    const out = run('chromatic-aberration', src, { centerX: 0.5, centerY: 0.5 }, 80, CW, CH);
    const centreShift = Math.abs(wideAt(out, CW / 2, CH / 2) - wideAt(src, CW / 2, CH / 2));
    expect(centreShift).toBeLessThanOrEqual(1);
    // Near a corner, on a stripe boundary, red and blue must disagree.
    let maxSeparation = 0;
    for (let y = 0; y < 40; y += 1) {
      for (let x = 0; x < CW; x += 1) {
        maxSeparation = Math.max(maxSeparation, Math.abs(wideAt(out, x, y, 0) - wideAt(out, x, y, 2)));
      }
    }
    expect(maxSeparation).toBeGreaterThan(8);
  });

  it('keeps the green record unshifted', () => {
    const src = wideVerticalEdge();
    const out = run('chromatic-aberration', src, {}, 80, CW, CH);
    for (let y = 0; y < CH; y += 37) {
      for (let x = 0; x < CW; x += 37) {
        expect(wideAt(out, x, y, 1)).toBe(wideAt(src, x, y, 1));
      }
    }
  });

  it('scales its displacement with the frame, not the pixel grid', () => {
    // The same content at two resolutions must fringe at the same relative
    // position — that is what makes preview and export agree.
    const small = run('chromatic-aberration', wideVerticalEdge(), {}, 80, CW, CH);
    const separationAt = (frame: Uint8ClampedArray, fraction: number) => {
      const x = Math.round(fraction * (CW - 1));
      const y = Math.round(0.5 * (CH - 1));
      return Math.abs(frame[(y * CW + x) * 4] - frame[(y * CW + x) * 4 + 2]);
    };
    // Fringing grows away from the centre.
    expect(separationAt(small, 0.02)).toBeGreaterThanOrEqual(separationAt(small, 0.5));
  });
});

describe('tilt-shift', () => {
  it('keeps the band sharp and blurs the far edges', () => {
    const out = run('tilt-shift', checkerboard(), {
      position: 0.5, bandWidth: 0.2, feather: 0.1, radius: 0.05,
    });
    const bandContrast = localContrast(out, 22, 26);
    const edgeContrast = localContrast(out, 0, 4);
    expect(bandContrast).toBeGreaterThan(edgeContrast * 2);
  });

  it('honours vertical orientation', () => {
    const out = run('tilt-shift', checkerboard(), {
      position: 0.5, bandWidth: 0.2, feather: 0.1, radius: 0.05, orientation: 'vertical',
    });
    // With a vertical band, sharpness varies across x, so a full-width row scan
    // sees both sharp and blurred regions rather than one uniform state.
    const rowContrast = localContrast(out, 24, 25);
    const bandOnly = Math.abs(at(out, 24, 24) - at(out, 25, 24));
    expect(bandOnly).toBeGreaterThan(rowContrast);
  });
});

describe('light-leak', () => {
  it('is brightest near its chosen origin', () => {
    const src = fieldWithHighlight();
    const out = run('light-leak', src, { corner: 'top-right', reach: 1.2 });
    const nearOrigin = at(out, W - 2, 1) - at(src, W - 2, 1);
    const farCorner = at(out, 1, H - 2) - at(src, 1, H - 2);
    expect(nearOrigin).toBeGreaterThan(5);
    expect(nearOrigin).toBeGreaterThan(farCorner);
  });

  it('moves with the origin setting', () => {
    const src = fieldWithHighlight();
    const topRight = run('light-leak', src, { corner: 'top-right', reach: 1.2 });
    const bottomLeft = run('light-leak', src, { corner: 'bottom-left', reach: 1.2 });
    expect(at(topRight, W - 2, 1)).toBeGreaterThan(at(bottomLeft, W - 2, 1));
    expect(at(bottomLeft, 1, H - 2)).toBeGreaterThan(at(topRight, 1, H - 2));
  });

  it('warms rather than cools — red gains most', () => {
    const src = fieldWithHighlight();
    const out = run('light-leak', src, { corner: 'top-right', reach: 1.2, warmth: 90 });
    const red = at(out, W - 2, 1, 0) - at(src, W - 2, 1, 0);
    const blue = at(out, W - 2, 1, 2) - at(src, W - 2, 1, 2);
    expect(red).toBeGreaterThan(blue);
  });
});

describe('neon-edge', () => {
  it('lights the edge and drops the flat areas', () => {
    const src = verticalEdge();
    const out = run('neon-edge', src, { glow: 0.01, threshold: 5, darken: 80 });
    let edgePeak = 0;
    for (let x = 0; x < W; x += 1) {
      const value = at(out, x, H / 2, 0) + at(out, x, H / 2, 1) + at(out, x, H / 2, 2);
      if (Math.abs(x - W / 2) <= 2) edgePeak = Math.max(edgePeak, value);
    }
    const flatArea = at(out, 4, H / 2, 0) + at(out, 4, H / 2, 1) + at(out, 4, H / 2, 2);
    const flatSource = at(src, 4, H / 2, 0) * 3;
    expect(edgePeak).toBeGreaterThan(flatArea);
    expect(flatArea).toBeLessThan(flatSource);
  });

  it('tints the edge with the chosen hue', () => {
    const src = verticalEdge();
    const green = run('neon-edge', src, { hue: 120, threshold: 5, glow: 0.01 });
    const magenta = run('neon-edge', src, { hue: 300, threshold: 5, glow: 0.01 });
    const x = Math.round(W / 2);
    expect(at(green, x, H / 2, 1)).toBeGreaterThan(at(green, x, H / 2, 2));
    expect(at(magenta, x, H / 2, 2)).toBeGreaterThan(at(magenta, x, H / 2, 1));
  });
});

describe('halftone-print', () => {
  it('turns a flat mid-tone into ink and paper rather than mid-grey', () => {
    const flat = new Uint8ClampedArray(W * H * 4);
    for (let p = 0; p < W * H; p += 1) {
      flat[p * 4] = 128;
      flat[p * 4 + 1] = 128;
      flat[p * 4 + 2] = 128;
      flat[p * 4 + 3] = 255;
    }
    const out = run('halftone-print', flat, { cellSize: 0.08, softness: 0.05 }, 100);
    let dark = 0;
    let light = 0;
    for (let p = 0; p < W * H; p += 1) {
      if (out[p * 4] < 70) dark += 1;
      if (out[p * 4] > 185) light += 1;
    }
    // A working screen splits a flat tone into both extremes.
    expect(dark).toBeGreaterThan(20);
    expect(light).toBeGreaterThan(20);
  });

  it('grows dots as the tone darkens', () => {
    const ramp = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const o = (y * W + x) * 4;
        const value = Math.round((x / (W - 1)) * 255);
        ramp[o] = value;
        ramp[o + 1] = value;
        ramp[o + 2] = value;
        ramp[o + 3] = 255;
      }
    }
    const out = run('halftone-print', ramp, { cellSize: 0.06, softness: 0.1 }, 100);
    const inkIn = (fromX: number, toX: number) => {
      let count = 0;
      for (let y = 0; y < H; y += 1) {
        for (let x = fromX; x < toX; x += 1) if (at(out, x, y) < 128) count += 1;
      }
      return count;
    };
    // The dark end of the ramp must carry more ink than the light end.
    expect(inkIn(0, 12)).toBeGreaterThan(inkIn(W - 12, W));
  });
});
