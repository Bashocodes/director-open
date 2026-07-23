import { describe, expect, it } from 'vitest';
import type { ReelMotion } from '../../../shared/directorSchemas';
import { cameraFfmpegExpressions, cameraPoseAt } from './motionRecipes';

describe('shared cinematic camera recipes', () => {
  it('uses a smooth eased push rather than a linear zoom', () => {
    expect(cameraPoseAt('push-in', 0)).toEqual({ zoom: 1, focusX: 0.5, focusY: 0.5 });
    expect(cameraPoseAt('push-in', 0.5).zoom).toBeCloseTo(1.07, 6);
    expect(cameraPoseAt('push-in', 1).zoom).toBeCloseTo(1.14, 6);
    expect(cameraFfmpegExpressions('push-in', 95).zoom).toContain('*6-15');
  });

  it('keeps loop-safe camera moves at the same opening and closing pose', () => {
    (['pulse', 'float'] as ReelMotion[]).forEach((motion) => {
      expect(cameraPoseAt(motion, 0).zoom).toBeCloseTo(cameraPoseAt(motion, 1).zoom, 8);
      expect(cameraPoseAt(motion, 0).focusX).toBeCloseTo(cameraPoseAt(motion, 1).focusX, 8);
      expect(cameraPoseAt(motion, 0).focusY).toBeCloseTo(cameraPoseAt(motion, 1).focusY, 8);
    });
  });

  it('adds subject-aware hero and arc choreography', () => {
    const hero = cameraPoseAt('hero-push', 1);
    expect(hero.zoom).toBeCloseTo(1.16, 8);
    expect(hero.focusX).toBeCloseTo(0.48, 8);
    expect(hero.focusY).toBeCloseTo(0.4, 8);
    expect(cameraPoseAt('arc-left', 0).focusX).toBeGreaterThan(cameraPoseAt('arc-left', 1).focusX);
    expect(cameraFfmpegExpressions('arc-right', 95).focusY).toContain('sin(PI*');
  });
});
