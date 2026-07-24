import { describe, expect, it } from 'vitest';
import { clampPlayhead, keyToPlayerAction } from './playerControls';

describe('player keyboard controls', () => {
  it('toggles playback on Space', () => {
    expect(keyToPlayerAction({ key: ' ' }, { fps: 30 })).toEqual({ type: 'toggle-play' });
    expect(keyToPlayerAction({ key: 'Spacebar' }, { fps: 30 })).toEqual({ type: 'toggle-play' });
  });

  it('scrubs one second per arrow by default', () => {
    expect(keyToPlayerAction({ key: 'ArrowLeft' }, { fps: 30 })).toEqual({ type: 'scrub', delta: -1 });
    expect(keyToPlayerAction({ key: 'ArrowRight' }, { fps: 24 })).toEqual({ type: 'scrub', delta: 1 });
  });

  it('scrubs a single frame with Shift held', () => {
    expect(keyToPlayerAction({ key: 'ArrowRight', shiftKey: true }, { fps: 25 })).toEqual({ type: 'scrub', delta: 1 / 25 });
    expect(keyToPlayerAction({ key: 'ArrowLeft', shiftKey: true }, { fps: 30 })).toEqual({ type: 'scrub', delta: -1 / 30 });
  });

  it('ignores unrelated keys', () => {
    expect(keyToPlayerAction({ key: 'a' }, { fps: 30 })).toBeNull();
    expect(keyToPlayerAction({ key: 'Enter' }, { fps: 30 })).toBeNull();
  });

  it('clamps the playhead into range', () => {
    expect(clampPlayhead(-5, 10)).toBe(0);
    expect(clampPlayhead(15, 10)).toBe(10);
    expect(clampPlayhead(4, 10)).toBe(4);
    expect(clampPlayhead(Number.NaN, 10)).toBe(0);
  });
});
