import { describe, expect, it } from 'vitest';
import { pluginRegistry, resolvedPluginParams } from '../registry';
import type { AnyEffectPlugin } from '../types';

const W = 20;
const H = 32;

/** A deterministic textured source (diagonal ramp + a bright corner for bloom). */
function source(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 4;
      const bright = x > W - 5 && y < 5 ? 255 : 0;
      out[o] = Math.min(255, Math.round((200 * (x + y)) / (W + H)) + bright);
      out[o + 1] = Math.min(255, Math.round((160 * x) / W) + bright);
      out[o + 2] = Math.min(255, Math.round((120 * y) / H) + bright);
      out[o + 3] = 255;
    }
  }
  return out;
}

function fingerprint(frame: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < frame.length; i += 1) {
    h ^= frame[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function runEffect(plugin: AnyEffectPlugin, progress: number, frameIndex: number): Uint8ClampedArray {
  if (!plugin.frameTransform) throw new Error(`${plugin.id} has no frameTransform`);
  return plugin.frameTransform({
    sourceRgba: source(),
    width: W,
    height: H,
    phase: 1,
    progress,
    seed: 1234,
    intensity: 60,
    frameIndex,
    frameCount: 4,
    baseSeed: 1234,
    params: resolvedPluginParams(plugin, {}, { intensity: 60 }),
  });
}

const EFFECT_IDS = ['film-grain', 'halation-bloom', 'vignette-breathe'];

describe('effect goldens', () => {
  it('produces deterministic, stable fingerprints at 0.25/0.5/0.75', () => {
    const snapshot: Record<string, string[]> = {};
    for (const id of EFFECT_IDS) {
      const plugin = pluginRegistry.getEffect(id, 'visual')!;
      expect(plugin.stage, `${id} must be a pre-motion structural effect`).toBe('pre-motion');
      const fingerprints = [0.25, 0.5, 0.75].map((progress, index) => fingerprint(runEffect(plugin, progress, index + 1)));
      // Determinism: identical inputs → identical output.
      const repeat = fingerprint(runEffect(plugin, 0.5, 2));
      expect(repeat).toBe(fingerprints[1]);
      snapshot[id] = fingerprints;
    }
    expect(snapshot).toMatchSnapshot();
  });

  it('vignette-breathe darkens the corners more than the centre', () => {
    const plugin = pluginRegistry.getEffect('vignette-breathe', 'visual')!;
    const out = runEffect(plugin, 0.5, 0);
    const src = source();
    const centre = (H / 2) * W + W / 2;
    const corner = 0;
    const drop = (i: number) => src[i * 4] - out[i * 4];
    expect(drop(corner)).toBeGreaterThanOrEqual(drop(centre));
  });
});
