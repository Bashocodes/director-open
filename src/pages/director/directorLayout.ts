import type { CanvasObject } from './types';

const REFERENCE_COLUMNS = 3;
const REFERENCE_START = { x: 560, y: 220 };
const REFERENCE_GAP = { x: 390, y: 390 };

/** Keeps automatically added references clear of the corpus drawer and brief. */
export function nextReferencePosition(objects: CanvasObject[]) {
  const index = objects.filter((item) => item.kind === 'reference').length;
  return {
    x: REFERENCE_START.x + (index % REFERENCE_COLUMNS) * REFERENCE_GAP.x,
    y: REFERENCE_START.y + Math.floor(index / REFERENCE_COLUMNS) * REFERENCE_GAP.y,
  };
}
