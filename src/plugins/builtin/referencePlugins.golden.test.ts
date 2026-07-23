import { describe, expect, it } from 'vitest';
import {
  pluginRegistry,
  safePluginParams,
} from '../registry';
import { thresholdMeltPlugin } from '../../pages/director/reel/structuralEffects/thresholdMelt';
import { renderStructuralEffectFrame } from '../../pages/director/reel/structuralEffects';

const WIDTH = 96;
const HEIGHT = 128;

function fixtureFrame() {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const wave = (Math.sin(x * 0.11 + y * 0.019) + 1) * 0.5;
      const drift = y / (HEIGHT - 1);
      const base = 18 + Math.round(wave * 142 + drift * 38);
      pixels[offset] = Math.min(255, base + Math.round(x / WIDTH * 31));
      pixels[offset + 1] = Math.min(255, base + Math.round(drift * 17));
      pixels[offset + 2] = Math.max(0, base - 14 + Math.round(wave * 9));
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function byteFingerprint(source: Uint8ClampedArray, output: Uint8ClampedArray) {
  let hash = 0x811c9dc5;
  let changedPixels = 0;
  for (let offset = 0; offset < output.length; offset += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel += 1) {
      hash = Math.imul(hash ^ output[offset + channel], 0x01000193) >>> 0;
      changed ||= output[offset + channel] !== source[offset + channel];
    }
    if (changed) changedPixels += 1;
  }
  return `fnv1a=${hash.toString(16).padStart(8, '0')};changed=${changedPixels}`;
}

function textFingerprint(value: unknown) {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

describe('reference plugin goldens', () => {
  it('keeps the halftone-reveal reference frame stable', () => {
    const plugin = pluginRegistry.getEffect('halftone-reveal', 'visual');
    expect(plugin?.deprecated).not.toBe(true);
    const source = fixtureFrame();
    const output = plugin!.frameTransform!({
      sourceRgba: source,
      width: WIDTH,
      height: HEIGHT,
      phase: 0.84,
      progress: 48 / 95,
      seed: 0.42 + 48 * 0.003,
      baseSeed: 0.42,
      frameIndex: 48,
      frameCount: 96,
      intensity: 60,
      params: safePluginParams(plugin!, { intensity: 60 }),
    });

    expect(byteFingerprint(source, output)).toBe('fnv1a=56b43b25;changed=12288');
  });

  it('keeps push-in preview poses and FFmpeg expressions stable', () => {
    const plugin = pluginRegistry.getMotion('push-in');
    expect(plugin?.deprecated).not.toBe(true);
    const params = safePluginParams(plugin!);
    const poses = [0, 0.25, 0.5, 0.75, 1].map((progress) => {
      const pose = plugin!.cameraPose({ progress, params });
      return Object.fromEntries(
        Object.entries(pose).map(([key, value]) => [key, Number(value.toFixed(9))]),
      );
    });
    const ffmpeg = plugin!.ffmpegExpressions({ progressFrames: 95, params });

    expect(textFingerprint({ poses, ffmpeg })).toBe('49c237e2');
  });

  it('keeps the threshold-melt legacy adapter byte-for-byte equivalent', () => {
    const source = fixtureFrame();
    const options = {
      phase: 0.78,
      progress: 0.46,
      seed: 0.417,
      baseSeed: 0.42,
      frameIndex: 17,
      frameCount: 48,
      intensity: 72,
    };
    const legacy = thresholdMeltPlugin.renderFrame(source, WIDTH, HEIGHT, options);
    const adapted = renderStructuralEffectFrame(
      'threshold-melt',
      source,
      WIDTH,
      HEIGHT,
      options,
    );

    expect(adapted).toEqual(legacy);
  });
});
