import { describe, expect, it } from 'vitest';
import { motionEchoRgba } from './motionEchoPreview';

describe('motion echo preview buffer', () => {
  it('retains decaying highlights while current dark pixels move on', () => {
    const previous = new Uint8ClampedArray([240, 180, 90, 255, 20, 30, 40, 255]);
    const current = new Uint8ClampedArray([20, 20, 20, 255, 220, 210, 200, 255]);
    const { output, trail } = motionEchoRgba(current, previous, 0.9, 1);
    expect(Array.from(output)).toEqual([216, 162, 81, 255, 220, 210, 200, 255]);
    expect(output).toEqual(trail);
  });

  it('blends by the shared envelope amount and preserves alpha', () => {
    const previous = new Uint8ClampedArray([200, 180, 160, 90]);
    const current = new Uint8ClampedArray([20, 40, 60, 120]);
    const { output } = motionEchoRgba(current, previous, 0.9, 0.5);
    expect(Array.from(output)).toEqual([100, 101, 102, 120]);
  });

  it('starts clean when no sequential trail exists', () => {
    const current = new Uint8ClampedArray([10, 20, 30, 255]);
    expect(motionEchoRgba(current, undefined, 0.96, 1).output).toEqual(current);
  });
});
