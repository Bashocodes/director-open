import { cameraPoseAt } from './motionRecipes';
import { applyPreviewGradeFinish, previewGradeFilter } from './previewEffects';
import { reelGradeStack, type ReelClip } from './types';

/**
 * Composite a clip's boundary frame (cover + camera pose at the edge + grade)
 * to RGBA. Used by BOTH the preview transition path and the export renderer so
 * the two per-pixel transition inputs (frameA/frameB) are produced by identical
 * code — the basis of preview↔export transition parity.
 *
 * Structural visual effects are intentionally not applied to the boundary frame
 * (they are heavy and, during a short transition, not perceptible); the residual
 * canvas-vs-ffmpeg grade difference is the pre-existing preview/export gap.
 */
export function compositeClipBoundary(
  image: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  clip: ReelClip,
  width: number,
  height: number,
  edge: 'in' | 'out',
): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return new Uint8ClampedArray(width * height * 4);

  const progress = edge === 'out' ? 1 : 0;
  const pose = cameraPoseAt(clip.motion, progress, clip.pluginParams?.[clip.motion]);
  const sourceRatio = naturalWidth / Math.max(1, naturalHeight);
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (sourceRatio > targetRatio) drawWidth = height * sourceRatio;
  else drawHeight = width / sourceRatio;

  const overflowX = Math.max(0, drawWidth * pose.zoom - width);
  const overflowY = Math.max(0, drawHeight * pose.zoom - height);

  const grades = reelGradeStack(clip);
  const filters = grades
    .map((effect) => previewGradeFilter(effect, clip.intensity, clip.pluginParams?.[effect]))
    .filter((value) => value !== 'none');
  context.filter = filters.length ? filters.join(' ') : 'none';
  context.drawImage(
    image,
    -overflowX * pose.focusX,
    -overflowY * pose.focusY,
    drawWidth * pose.zoom,
    drawHeight * pose.zoom,
  );
  context.filter = 'none';
  grades.forEach((effect) => applyPreviewGradeFinish(context, effect, clip.intensity, width, height));

  return context.getImageData(0, 0, width, height).data;
}
