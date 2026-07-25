import { renderTextLayer, resolveTextLayerAlpha } from '../../../lib/text/renderTextLayer';
import { cameraPoseAt } from './motionRecipes';
import {
  applyPreviewGradeFinish,
  applyPreviewStructuralEffects,
  applyPreviewVisualEffect,
  previewGradeFilter,
  type PixelSortPreviewMetrics,
} from './previewEffects';
import { isStructuralEffect, structuralEffectIds } from './structuralEffects';
import { reelGradeStack, reelVisualEffectStack, type ReelClip } from './types';

/**
 * The single composition path for one clip frame.
 *
 * Both the live player and the still exporter call this, so a look can never
 * drift between what a person scrubs to and what they export. The only
 * difference between the two callers is resolution and the `fidelity` flag:
 * the player trades structural-effect resolution for frame rate, a still
 * export never does.
 */

export function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  clip: ReelClip,
  progress: number,
) {
  const { width: sourceWidth, height: sourceHeight } = intrinsicSize(image);
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (sourceRatio > targetRatio) drawWidth = height * sourceRatio;
  else drawHeight = width / sourceRatio;

  const pose = cameraPoseAt(clip.motion, progress, clip.pluginParams?.[clip.motion]);
  const overflowX = Math.max(0, drawWidth * pose.zoom - width);
  const overflowY = Math.max(0, drawHeight * pose.zoom - height);
  context.drawImage(
    image,
    -overflowX * pose.focusX,
    -overflowY * pose.focusY,
    drawWidth * pose.zoom,
    drawHeight * pose.zoom,
  );
}

export function drawCenteredCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
) {
  const { width: sourceWidth, height: sourceHeight } = intrinsicSize(image);
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  const drawWidth = sourceRatio > targetRatio ? height * sourceRatio : width;
  const drawHeight = sourceRatio > targetRatio ? height : width / sourceRatio;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

export function drawCameraFrame(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  clip: ReelClip,
  progress: number,
) {
  const pose = cameraPoseAt(clip.motion, progress, clip.pluginParams?.[clip.motion]);
  const drawWidth = width * pose.zoom;
  const drawHeight = height * pose.zoom;
  const overflowX = Math.max(0, drawWidth - width);
  const overflowY = Math.max(0, drawHeight - height);
  context.drawImage(source, -overflowX * pose.focusX, -overflowY * pose.focusY, drawWidth, drawHeight);
}

export function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function intrinsicSize(image: CanvasImageSource) {
  if (image instanceof HTMLImageElement) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  if (image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height };
  }
  const candidate = image as { width?: number; height?: number };
  return { width: candidate.width ?? 1, height: candidate.height ?? 1 };
}

function scratchCanvas(existing: HTMLCanvasElement | undefined, width: number, height: number) {
  const canvas = existing ?? document.createElement('canvas');
  resizeCanvas(canvas, width, height);
  return canvas;
}

/** Reusable offscreen canvases. The player keeps a set across frames; a still export makes one. */
export type ClipFrameScratch = {
  pixel?: HTMLCanvasElement;
  grade?: HTMLCanvasElement;
};

export type ComposeClipFrameOptions = {
  /** Destination context. Must already be sized to `width` x `height`. */
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  clip: ReelClip;
  width: number;
  height: number;
  /** Normalized 0..1 position inside the clip — drives motion and effect phase. */
  progress: number;
  /** Seconds elapsed inside the clip — drives text-layer fade timing. */
  localTime: number;
  fps: number;
  /**
   * `player` lets structural effects render at reduced resolution to hold frame
   * rate. `full` forces native resolution, which is what an export must use.
   */
  fidelity?: 'player' | 'full';
  scratch?: ClipFrameScratch;
};

/**
 * Composes one clip frame in the canonical order:
 * source + camera -> structural effects -> visual effects -> grades ->
 * grade finishes -> text layers.
 */
export function composeClipFrame(
  options: ComposeClipFrameOptions,
): PixelSortPreviewMetrics | undefined {
  const {
    context, image, clip, width, height, progress, localTime, fps,
  } = options;
  const fidelity = options.fidelity ?? 'player';
  const scratch = options.scratch ?? {};

  context.clearRect(0, 0, width, height);
  context.filter = 'none';

  const grades = reelGradeStack(clip);
  const gradeFilters = grades
    .map((effect) => previewGradeFilter(effect, clip.intensity, clip.pluginParams?.[effect]))
    .filter((value) => value !== 'none');

  const visualEffects = reelVisualEffectStack(clip);
  const structuralEffects = structuralEffectIds(visualEffects);
  let structuralEffectMetrics: PixelSortPreviewMetrics | undefined;

  if (structuralEffects.length > 0) {
    const pixelCanvas = scratchCanvas(scratch.pixel, width, height);
    scratch.pixel = pixelCanvas;
    const pixelContext = pixelCanvas.getContext('2d', { willReadFrequently: true });
    if (!pixelContext) return undefined;
    pixelContext.clearRect(0, 0, width, height);
    pixelContext.filter = 'none';
    drawCenteredCover(pixelContext, image, width, height);
    structuralEffectMetrics = applyPreviewStructuralEffects({
      context: pixelContext,
      clip,
      effects: structuralEffects,
      width,
      height,
      progress,
      fps,
      fullResolution: fidelity === 'full',
    });
    drawCameraFrame(context, pixelCanvas, width, height, clip, progress);
  } else {
    drawCover(context, image, width, height, clip, progress);
  }

  visualEffects
    .filter((effect) => !isStructuralEffect(effect))
    .forEach((effect) => applyPreviewVisualEffect({
      context,
      clip,
      effect,
      width,
      height,
      progress,
      fps,
    }));

  if (gradeFilters.length > 0) {
    const gradeCanvas = scratchCanvas(scratch.grade, width, height);
    scratch.grade = gradeCanvas;
    const gradeContext = gradeCanvas.getContext('2d');
    if (!gradeContext) return structuralEffectMetrics;
    gradeContext.clearRect(0, 0, width, height);
    gradeContext.filter = gradeFilters.join(' ');
    gradeContext.drawImage(context.canvas, 0, 0);
    gradeContext.filter = 'none';
    context.clearRect(0, 0, width, height);
    context.drawImage(gradeCanvas, 0, 0);
  }

  grades.forEach((effect) => applyPreviewGradeFinish(context, effect, clip.intensity, width, height));

  clip.textLayers.forEach((layer) => {
    const layerAlpha = resolveTextLayerAlpha(layer.timing, localTime);
    if (layerAlpha <= 0) return;
    renderTextLayer(context, layer, { width, height, alpha: layerAlpha });
  });

  return structuralEffectMetrics;
}
