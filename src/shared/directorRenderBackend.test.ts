import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_DEFAULT_COLOR_DEPTH,
  effectiveColorDepth,
  effectiveRenderBackend,
  renderBackendLabel,
} from './directorRenderBackend';
import { DIRECTOR_ADOBE_WORKING_SPACE } from './directorAdobeContract';

describe('Director render backend contract', () => {
  it('keeps old projects on the FFmpeg path', () => {
    expect(effectiveRenderBackend({})).toBe('ffmpeg');
  });

  it('reports each backend’s real executable precision', () => {
    expect(effectiveColorDepth({})).toBe(DIRECTOR_DEFAULT_COLOR_DEPTH);
    expect(effectiveColorDepth({ renderBackend: 'ffmpeg', colorDepth: 32 })).toBe(8);
    expect(effectiveColorDepth({ renderBackend: 'after-effects', colorDepth: 8 })).toBe(32);
    expect(DIRECTOR_ADOBE_WORKING_SPACE).toBe('Rec.2100 HLG Scene W100');
  });

  it('labels the paid-capability path without removing the free path', () => {
    expect(renderBackendLabel('after-effects')).toBe('Adobe After Effects');
    expect(renderBackendLabel('ffmpeg')).toBe('FFmpeg (free/local)');
  });
});
