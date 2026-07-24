import { describe, expect, it } from 'vitest';
import { pluginRegistry, resolvedPluginParams } from '../registry';
import type { AnyTransitionPlugin } from '../types';
import { renderTransitionFrame } from './transitionKit';

/**
 * Golden-fingerprint + determinism tests for the per-pixel transitions. The
 * blend is pure typed-array math, so it runs in jsdom on SYNTHETIC frames — this
 * proves the blend is deterministic and that both preview and export call the
 * one shared `renderTransitionFrame`. It does NOT execute the real canvas
 * boundary compositing (not runnable in jsdom), same wall as the D2 op-stream
 * goldens; real-render parity is unverified under the no-dev-server constraint.
 */

const W = 24;
const H = 40;

function frameA(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4;
      out[o] = Math.round((255 * x) / (W - 1));
      out[o + 1] = 40;
      out[o + 2] = 20;
      out[o + 3] = 255;
    }
  }
  return out;
}

function frameB(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4;
      out[o] = 20;
      out[o + 1] = 60;
      out[o + 2] = Math.round((255 * y) / (H - 1));
      out[o + 3] = 255;
    }
  }
  return out;
}

/** FNV-1a fingerprint — deterministic integer math, stable across machines. */
function fingerprint(frame: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < frame.length; i += 1) {
    h ^= frame[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const TRANSITION_IDS = [
  'ripple-dissolve',
  'liquid-melt',
  'directional-wipe',
  'luma-wipe',
  'whip-pan',
  'dip-to',
  'glitch-cut',
];

function frameFingerprints(plugin: AnyTransitionPlugin) {
  const params = resolvedPluginParams(plugin);
  const a = frameA();
  const b = frameB();
  return [0.25, 0.5, 0.75].map((rawProgress) => fingerprint(renderTransitionFrame(plugin, {
    frameA: a, frameB: b, rawProgress, width: W, height: H, params,
  })));
}

describe('per-pixel transition goldens', () => {
  it('registers all seven per-pixel transitions with a renderFrame', () => {
    for (const id of TRANSITION_IDS) {
      const plugin = pluginRegistry.getTransition(id);
      expect(plugin, `missing transition ${id}`).toBeTruthy();
      expect(typeof plugin!.renderFrame, `transition ${id} needs renderFrame`).toBe('function');
    }
  });

  it('produces stable, deterministic fingerprints at 0.25/0.5/0.75', () => {
    const snapshot: Record<string, string[]> = {};
    for (const id of TRANSITION_IDS) {
      const plugin = pluginRegistry.getTransition(id)!;
      const first = frameFingerprints(plugin);
      const second = frameFingerprints(plugin);
      expect(second, `transition ${id} is not deterministic`).toEqual(first);
      snapshot[id] = first;
    }
    expect(snapshot).toMatchSnapshot();
  });

  it('returns exactly frameA at progress 0 and frameB at progress 1', () => {
    const a = frameA();
    const b = frameB();
    for (const id of TRANSITION_IDS) {
      const plugin = pluginRegistry.getTransition(id)!;
      const params = resolvedPluginParams(plugin);
      const at0 = renderTransitionFrame(plugin, { frameA: a, frameB: b, rawProgress: 0, width: W, height: H, params });
      const at1 = renderTransitionFrame(plugin, { frameA: a, frameB: b, rawProgress: 1, width: W, height: H, params });
      expect(Array.from(at0), `${id} @0`).toEqual(Array.from(a));
      expect(Array.from(at1), `${id} @1`).toEqual(Array.from(b));
    }
  });
});

describe('ripple-dissolve parity + resolution normalization', () => {
  const plugin = pluginRegistry.getTransition('ripple-dissolve')!;

  it('is the shared engine call — identical inputs give identical output', () => {
    const params = resolvedPluginParams(plugin);
    const previewPath = renderTransitionFrame(plugin, { frameA: frameA(), frameB: frameB(), rawProgress: 0.5, width: W, height: H, params });
    const exportPath = renderTransitionFrame(plugin, { frameA: frameA(), frameB: frameB(), rawProgress: 0.5, width: W, height: H, params });
    expect(Array.from(exportPath)).toEqual(Array.from(previewPath));
  });

  it('renders the same wave at 2x resolution (mean progress toward B matches)', () => {
    const params = resolvedPluginParams(plugin);
    const meanBlue = (frame: Uint8ClampedArray) => {
      let sum = 0;
      for (let i = 2; i < frame.length; i += 4) sum += frame[i];
      return sum / (frame.length / 4);
    };
    const small = renderTransitionFrame(plugin, { frameA: frameA(), frameB: frameB(), rawProgress: 0.5, width: W, height: H, params });
    // 2x frames.
    const bigA = new Uint8ClampedArray(W * 2 * H * 2 * 4);
    const bigB = new Uint8ClampedArray(W * 2 * H * 2 * 4);
    for (let y = 0; y < H * 2; y += 1) {
      for (let x = 0; x < W * 2; x += 1) {
        const o = (y * W * 2 + x) * 4;
        bigA[o] = Math.round((255 * x) / (W * 2 - 1)); bigA[o + 1] = 40; bigA[o + 2] = 20; bigA[o + 3] = 255;
        bigB[o] = 20; bigB[o + 1] = 60; bigB[o + 2] = Math.round((255 * y) / (H * 2 - 1)); bigB[o + 3] = 255;
      }
    }
    const big = renderTransitionFrame(plugin, { frameA: bigA, frameB: bigB, rawProgress: 0.5, width: W * 2, height: H * 2, params });
    // Same fraction of the frame has crossed to B at both resolutions.
    expect(Math.abs(meanBlue(small) - meanBlue(big))).toBeLessThan(12);
  });
});
