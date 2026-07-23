import { describe, expect, it } from 'vitest';
import {
  renderStructuralEffectFrame,
  STRUCTURAL_EFFECT_IDS,
  type StructuralEffectId,
} from './structuralEffects';

const WIDTH = 96;
const HEIGHT = 128;
const FRAME_INDEX = 48;
const FRAME_COUNT = 96;

const GOLDEN_OPTIONS = {
  phase: 0.84,
  progress: FRAME_INDEX / (FRAME_COUNT - 1),
  seed: 0.42 + FRAME_INDEX * 0.003,
  baseSeed: 0.42,
  frameIndex: FRAME_INDEX,
  frameCount: FRAME_COUNT,
  intensity: 60,
} as const;

// One deliberately visible line per effect: update only the affected line when
// a reviewed visual-maths change intentionally alters its rendered pixels.
const GOLDEN_FINGERPRINTS = {
  'pixel-sort': 'fnv1a=e31f4f4b;changed=1337',
  'glitch-burst': 'fnv1a=f23c0cae;changed=12276',
  'halftone-reveal': 'fnv1a=56b43b25;changed=12288',
  'ripple-drift': 'fnv1a=09657059;changed=9337',
  'threshold-melt': 'fnv1a=594e4409;changed=12288',
} as const satisfies Record<StructuralEffectId, string>;

function fixtureFrame() {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const horizontalWave = (Math.sin(x * 0.11 + y * 0.019) + 1) * 0.5;
      const verticalDrift = y / (HEIGHT - 1);
      const base = 18 + Math.round(horizontalWave * 142 + verticalDrift * 38);
      pixels[offset] = Math.min(255, base + Math.round(x / WIDTH * 31));
      pixels[offset + 1] = Math.min(255, base + Math.round(verticalDrift * 17));
      pixels[offset + 2] = Math.max(0, base - 14 + Math.round(horizontalWave * 9));
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function fingerprint(source: Uint8ClampedArray, output: Uint8ClampedArray) {
  let hash = 0x811c9dc5;
  let changedPixels = 0;
  for (let offset = 0; offset < output.length; offset += 4) {
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      hash = Math.imul(hash ^ output[offset + channel], 0x01000193) >>> 0;
      pixelChanged ||= output[offset + channel] !== source[offset + channel];
    }
    if (pixelChanged) changedPixels += 1;
  }
  return `fnv1a=${hash.toString(16).padStart(8, '0')};changed=${changedPixels}`;
}

describe('structural effect golden frames', () => {
  it.each(STRUCTURAL_EFFECT_IDS)('%s keeps its reviewed fixed-frame fingerprint', (id) => {
    const source = fixtureFrame();
    const pristine = source.slice();
    const output = renderStructuralEffectFrame(
      id,
      source,
      WIDTH,
      HEIGHT,
      GOLDEN_OPTIONS,
    );

    expect(source).toEqual(pristine);
    expect(fingerprint(source, output)).toBe(GOLDEN_FINGERPRINTS[id]);
  });
});
