import type { CanvasObject } from './types';

const REFERENCE_COLUMNS = 3;
const REFERENCE_START = { x: 560, y: 220 };
const REFERENCE_GAP = { x: 390, y: 390 };
const VISUAL_OBJECT_KINDS = new Set<CanvasObject['kind']>(['reference', 'upload', 'created']);

/** Keeps automatically added visual sources clear of overlays and one another. */
export function nextReferencePosition(objects: CanvasObject[]) {
  const index = objects.filter((item) => VISUAL_OBJECT_KINDS.has(item.kind)).length;
  return {
    x: REFERENCE_START.x + (index % REFERENCE_COLUMNS) * REFERENCE_GAP.x,
    y: REFERENCE_START.y + Math.floor(index / REFERENCE_COLUMNS) * REFERENCE_GAP.y,
  };
}
