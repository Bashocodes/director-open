import { describe, expect, it } from 'vitest';
import { pluginRegistry, pluginOptions, resolvedPluginParams } from './registry';

const NEW_TRANSITIONS = [
  'ripple-dissolve', 'liquid-melt', 'directional-wipe', 'luma-wipe', 'whip-pan', 'dip-to', 'glitch-cut',
];
const NEW_MOTIONS = ['slow-push', 'slow-pull', 'drift-diagonal', 'tilt-parallax', 'apex-shake'];
const NEW_EFFECTS = ['film-grain', 'halation-bloom', 'vignette-breathe'];

describe('registry auto-discovery lights up the picker', () => {
  it('registers every new transition, camera move, and effect from *.plugin.ts files', () => {
    const transitionIds = pluginOptions('transition').map((option) => option.id);
    const motionIds = pluginOptions('motion').map((option) => option.id);
    const effectIds = pluginOptions('effect', 'visual').map((option) => option.id);
    for (const id of NEW_TRANSITIONS) expect(transitionIds, `transition ${id}`).toContain(id);
    for (const id of NEW_MOTIONS) expect(motionIds, `motion ${id}`).toContain(id);
    for (const id of NEW_EFFECTS) expect(effectIds, `effect ${id}`).toContain(id);
  });

  it('exposes a description and a defaults-complete param schema for every plugin', () => {
    for (const id of [...NEW_TRANSITIONS, ...NEW_MOTIONS, ...NEW_EFFECTS]) {
      const plugin = pluginRegistry.get(id)!;
      expect(plugin.description.length, `${id} description`).toBeGreaterThan(4);
      expect(plugin.params.schema.safeParse({}).success, `${id} defaults`).toBe(true);
    }
  });
});

describe('camera moves are eased, never linear', () => {
  function linearMiss(id: string, key: 'zoom' | 'focusX' | 'focusY') {
    const plugin = pluginRegistry.getMotion(id)!;
    const params = resolvedPluginParams(plugin);
    const at = (progress: number) => plugin.cameraPose({ progress, params });
    const a = at(0)[key];
    const b = at(1)[key];
    const mid = at(0.25)[key];
    const linear = a + (b - a) * 0.25;
    return Math.abs(mid - linear);
  }

  it('slow-push / slow-pull / drift / tilt interpolate non-linearly at 0.25', () => {
    expect(linearMiss('slow-push', 'zoom')).toBeGreaterThan(0.002);
    expect(linearMiss('slow-pull', 'zoom')).toBeGreaterThan(0.002);
    expect(linearMiss('drift-diagonal', 'focusX')).toBeGreaterThan(0.01);
    expect(linearMiss('tilt-parallax', 'focusX')).toBeGreaterThan(0.002);
  });

  it('apex-shake is a burst — quiet at the ends, active at the apex', () => {
    const plugin = pluginRegistry.getMotion('apex-shake')!;
    const params = resolvedPluginParams(plugin);
    const offset = (progress: number) => {
      const pose = plugin.cameraPose({ progress, params });
      return Math.hypot(pose.focusX - 0.5, pose.focusY - 0.5);
    };
    expect(offset(0)).toBeLessThan(0.001);
    expect(offset(1)).toBeLessThan(0.001);
    expect(offset(0.5)).toBeGreaterThan(0.01);
  });

  it('keeps preview pose and ffmpeg zoom expression consistent for a static push', () => {
    const plugin = pluginRegistry.getMotion('slow-push')!;
    const params = resolvedPluginParams(plugin);
    // At progress 1, smootherstep(1) = 1, so zoom = 1.08 in both paths.
    expect(plugin.cameraPose({ progress: 1, params }).zoom).toBeCloseTo(1.08, 5);
    const expr = plugin.ffmpegExpressions({ progressFrames: 100, params });
    expect(expr.zoom).toContain('1+0.08');
  });
});
