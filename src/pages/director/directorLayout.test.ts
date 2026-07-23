import { describe, expect, it } from 'vitest';
import { nextReferencePosition } from './directorLayout';
import type { CanvasObject } from './types';

describe('Director reference layout', () => {
  it('places references in a non-overlapping grid clear of fixed overlays', () => {
    const objects = Array.from({ length: 7 }, (_, index) => ({
      id: `reference-${index}`,
      title: `Reference ${index}`,
      subtitle: '',
      kind: 'reference' as const,
      source: 'UPLOAD' as const,
      position: { x: 0, y: 0 },
      inherit: [],
      locks: [],
      summary: {
        emotion: [], materials: [], composition: [], palette: [], lighting: [],
        camera: [], world: [], style: [], subjects: [],
      },
    })) satisfies CanvasObject[];

    expect(nextReferencePosition([])).toEqual({ x: 560, y: 220 });
    expect(nextReferencePosition(objects.slice(0, 2))).toEqual({ x: 1_340, y: 220 });
    expect(nextReferencePosition(objects.slice(0, 3))).toEqual({ x: 560, y: 610 });
    expect(nextReferencePosition(objects)).toEqual({ x: 950, y: 1_000 });

    const artifact = { ...objects[0], id: 'contract-1', kind: 'contract' as const, source: 'CONTRACT' as const };
    expect(nextReferencePosition([artifact, ...objects.slice(0, 2)])).toEqual({ x: 1_340, y: 220 });
  });
});
