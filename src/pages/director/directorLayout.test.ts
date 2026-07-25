import { describe, expect, it } from 'vitest';
import { nextReferencePosition } from './directorLayout';
import type { CanvasObject } from './types';

describe('Director visual-source layout', () => {
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

  it('counts uploaded and created images in the same non-overlapping grid', () => {
    const upload = {
      id: 'upload-1',
      title: 'Upload',
      subtitle: '',
      kind: 'upload' as const,
      source: 'UPLOAD' as const,
      position: { x: 560, y: 220 },
      inherit: [],
      locks: [],
      summary: {
        emotion: [], materials: [], composition: [], palette: [], lighting: [],
        camera: [], world: [], style: [], subjects: [],
      },
    } satisfies CanvasObject;
    const created = {
      ...upload,
      id: 'created-1',
      kind: 'created' as const,
      source: 'CREATED' as const,
    } satisfies CanvasObject;
    const artifact = {
      ...upload,
      id: 'contract-1',
      kind: 'contract' as const,
      source: 'CONTRACT' as const,
    } satisfies CanvasObject;

    expect(nextReferencePosition([upload])).toEqual({ x: 950, y: 220 });
    expect(nextReferencePosition([artifact, upload, created])).toEqual({ x: 1_340, y: 220 });
  });
});
