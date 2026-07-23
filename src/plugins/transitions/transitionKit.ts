import { applyEasing, clamp01, type EasingCurve } from '../easing';
import type { AnyTransitionPlugin } from '../types';

/**
 * Pure, dependency-free helpers shared by the per-pixel transition plugins:
 * bilinear sampling, seeded RNG, and value noise — all implemented from first
 * principles (no third-party noise/rng library). Everything here is testable in
 * jsdom because it operates only on typed arrays.
 */

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Deterministic mulberry32 RNG. Same seed → same sequence. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold several integers into one 32-bit seed. */
export function hashSeed(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const value of values) {
    h ^= Math.round(value) | 0;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashLattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 362437);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1) on a unit lattice. Single octave. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const a = hashLattice(ix, iy, seed);
  const b = hashLattice(ix + 1, iy, seed);
  const c = hashLattice(ix, iy + 1, seed);
  const d = hashLattice(ix + 1, iy + 1, seed);
  return mix(mix(a, b, fx), mix(c, d, fx), fy);
}

/** Two-octave fractal value noise, still in [0,1). */
export function fractalNoise2D(x: number, y: number, seed: number): number {
  const first = valueNoise2D(x, y, seed);
  const second = valueNoise2D(x * 2.17, y * 2.17, seed ^ 0x9e3779b9);
  return clamp01(first * 0.65 + second * 0.35);
}

/** Bilinear-sample an RGBA frame at fractional pixel coords into `out` at `outOffset`. */
export function sampleBilinearInto(
  out: Uint8ClampedArray,
  outOffset: number,
  frame: Uint8ClampedArray,
  width: number,
  height: number,
  fx: number,
  fy: number,
): void {
  const cx = Math.min(width - 1, Math.max(0, fx));
  const cy = Math.min(height - 1, Math.max(0, fy));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  for (let channel = 0; channel < 4; channel += 1) {
    const top = mix(frame[i00 + channel], frame[i10 + channel], tx);
    const bottom = mix(frame[i01 + channel], frame[i11 + channel], tx);
    out[outOffset + channel] = mix(top, bottom, ty);
  }
}

/** Per-pixel A→B crossfade written into `out`. */
export function blendFramesInto(
  out: Uint8ClampedArray,
  frameA: Uint8ClampedArray,
  frameB: Uint8ClampedArray,
  amount: number,
): void {
  const t = clamp01(amount);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = frameA[i] + (frameB[i] - frameA[i]) * t;
  }
}

type TransitionParamsBase = { easing?: EasingCurve };

/**
 * Single shared entry point used by BOTH the preview and export paths. Applies
 * the eased progress and delegates to the plugin's pure `renderFrame`. Returns
 * exactly frameA at progress 0 and frameB at progress 1 so the transition seam
 * matches the underlying (covered) xfade base.
 */
export function renderTransitionFrame(
  plugin: AnyTransitionPlugin,
  input: {
    frameA: Uint8ClampedArray;
    frameB: Uint8ClampedArray;
    rawProgress: number;
    width: number;
    height: number;
    params: Record<string, unknown> & TransitionParamsBase;
  },
): Uint8ClampedArray {
  if (!plugin.renderFrame) {
    throw new Error(`Transition “${plugin.id}” has no renderFrame; use the affine path.`);
  }
  const eased = applyEasing(input.params.easing ?? 'ease-in-out', clamp01(input.rawProgress));
  if (eased <= 0) return input.frameA.slice();
  if (eased >= 1) return input.frameB.slice();
  return plugin.renderFrame({
    frameA: input.frameA,
    frameB: input.frameB,
    progress: eased,
    width: input.width,
    height: input.height,
    params: input.params,
  });
}
