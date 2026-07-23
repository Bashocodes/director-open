import type { TextAlign, TextLayer } from '../../shared/directorSchemas';
import { fontFamily, fontWeightValue } from './fontCatalog';

/**
 * SINGLE SOURCE OF TRUTH for on-screen text.
 *
 * Both the live preview overlay and the export path call {@link renderTextLayer}
 * with the same layer + target pixel dimensions, so what the preview shows is
 * what the exported MP4 contains. The renderer is time-agnostic: the fade
 * envelope is computed separately by {@link resolveTextLayerAlpha} and passed in
 * as `alpha`. Preview passes the live alpha; export passes 1 and lets FFmpeg's
 * `fade` filter reproduce the identical linear envelope over the same PNG.
 *
 * Everything scales from a 1080-wide reference so 540×960 preview and
 * 1080×1920 export render identically.
 */

/** The subset of CanvasRenderingContext2D the renderer touches. */
export interface Text2DContext {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  measureText(text: string): { width: number };
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  roundRect?(x: number, y: number, width: number, height: number, radii: number): void;
  fill(): void;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  letterSpacing?: string;
}

export const TEXT_REFERENCE_WIDTH = 1080;

export type RenderTextLayerOptions = {
  width: number;
  height: number;
  /** Global alpha 0..1 (fade). Defaults to 1 (export path). */
  alpha?: number;
};

/** Linear fade envelope matching FFmpeg `fade=alpha=1`. Returns 0..1. */
export function resolveTextLayerAlpha(timing: TextLayer['timing'], timeSec: number): number {
  const { inSec, outSec, fadeInSec, fadeOutSec } = timing;
  if (outSec <= inSec) return timeSec >= inSec && timeSec <= inSec ? 1 : 0;
  if (timeSec < inSec || timeSec > outSec) return 0;
  // Clamp overlapping fades into the visible window.
  const span = outSec - inSec;
  const fadeIn = Math.min(Math.max(0, fadeInSec), span);
  const fadeOut = Math.min(Math.max(0, fadeOutSec), span - fadeIn);
  let alpha = 1;
  if (fadeIn > 0 && timeSec < inSec + fadeIn) alpha = (timeSec - inSec) / fadeIn;
  if (fadeOut > 0 && timeSec > outSec - fadeOut) alpha = Math.min(alpha, (outSec - timeSec) / fadeOut);
  return Math.min(1, Math.max(0, alpha));
}

function anchorFractions(anchor: TextLayer['anchor']): { ax: number; ay: number } {
  const [vertical, horizontal] = anchor.split('-') as ['top' | 'center' | 'bottom', 'left' | 'center' | 'right'];
  const ax = horizontal === 'left' ? 0 : horizontal === 'right' ? 1 : 0.5;
  const ay = vertical === 'top' ? 0 : vertical === 'bottom' ? 1 : 0.5;
  return { ax, ay };
}

function alignToTextAlign(align: TextAlign): CanvasTextAlign {
  return align;
}

/** Word-wrap each explicit line to `maxWidth` using the context's metrics. */
export function wrapTextLines(ctx: Text2DContext, content: string, maxWidth: number): string[] {
  const paragraphs = content.replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawScrim(
  ctx: Text2DContext,
  layer: TextLayer,
  lineWidths: number[],
  boxLeft: number,
  top: number,
  boxWidth: number,
  lineHeightPx: number,
  fontPx: number,
  align: TextAlign,
) {
  const background = layer.style.background;
  if (background.kind !== 'scrim' || background.opacity <= 0) return;
  const padX = fontPx * 0.4;
  const padY = fontPx * 0.28;
  const textWidth = Math.max(0, ...lineWidths);
  const pillWidth = Math.min(boxWidth, textWidth) + padX * 2;
  const pillHeight = lineWidths.length * lineHeightPx + padY * 2;
  const pillLeft = align === 'left'
    ? boxLeft - padX
    : align === 'right'
      ? boxLeft + boxWidth - pillWidth + padX
      : boxLeft + boxWidth / 2 - pillWidth / 2;
  const radius = Math.min(pillHeight / 2, fontPx * 0.5);
  ctx.fillStyle = withOpacity(background.color, background.opacity);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(pillLeft, top - padY, pillWidth, pillHeight, radius);
    ctx.fill();
  } else {
    ctx.fillRect(pillLeft, top - padY, pillWidth, pillHeight);
  }
}

/** Apply an 0..1 opacity to a #hex color, producing an rgba() string. */
export function withOpacity(hex: string, opacity: number): string {
  const normalized = hex.replace('#', '');
  const expand = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const r = parseInt(expand.slice(0, 2), 16) || 0;
  const g = parseInt(expand.slice(2, 4), 16) || 0;
  const b = parseInt(expand.slice(4, 6), 16) || 0;
  const baseAlpha = expand.length >= 8 ? (parseInt(expand.slice(6, 8), 16) || 0) / 255 : 1;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, baseAlpha * opacity))})`;
}

export function renderTextLayer(ctx: Text2DContext, layer: TextLayer, options: RenderTextLayerOptions): void {
  const alpha = options.alpha ?? 1;
  if (alpha <= 0) return;
  const content = layer.style.case === 'upper' ? layer.content.toUpperCase() : layer.content;
  if (!content.trim()) return;

  const scale = options.width / TEXT_REFERENCE_WIDTH;
  const fontPx = Math.max(1, layer.style.sizePx * scale);
  const lineHeightPx = fontPx * layer.style.lineHeight;
  const letterSpacingPx = layer.style.letterSpacing * scale;
  const family = fontFamily(layer.style.fontId);
  const weight = fontWeightValue(layer.style.fontId, layer.style.weight);
  const italic = layer.style.italic ? 'italic ' : '';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${italic}${weight} ${fontPx}px "${family}", sans-serif`;
  if (typeof ctx.letterSpacing === 'string') ctx.letterSpacing = `${letterSpacingPx}px`;

  const boxWidth = layer.widthFraction * options.width;
  const lines = wrapTextLines(ctx, content, boxWidth);
  const lineWidths = lines.map((line) => ctx.measureText(line).width);
  const blockHeight = lines.length * lineHeightPx;

  const px = layer.x * options.width;
  const py = layer.y * options.height;
  const { ax, ay } = anchorFractions(layer.anchor);

  ctx.translate(px, py);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);

  const boxLeft = -ax * boxWidth;
  const top = -ay * blockHeight;
  const align = layer.style.align;
  ctx.textAlign = alignToTextAlign(align);
  ctx.textBaseline = 'top';
  const lineX = align === 'left' ? boxLeft : align === 'right' ? boxLeft + boxWidth : boxLeft + boxWidth / 2;

  drawScrim(ctx, layer, lineWidths, boxLeft, top, boxWidth, lineHeightPx, fontPx, align);

  const drawLines = (draw: (line: string, x: number, y: number) => void) => {
    lines.forEach((line, index) => {
      if (!line) return;
      draw(line, lineX, top + index * lineHeightPx + (lineHeightPx - fontPx) / 2);
    });
  };

  // Shadow pass.
  const { shadow } = layer.style;
  if (shadow.blur > 0 || shadow.offsetX !== 0 || shadow.offsetY !== 0) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur * scale;
    ctx.shadowOffsetX = shadow.offsetX * scale;
    ctx.shadowOffsetY = shadow.offsetY * scale;
    ctx.fillStyle = layer.style.color;
    drawLines((line, x, y) => ctx.fillText(line, x, y));
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Outline pass.
  if (layer.style.outline.width > 0) {
    ctx.strokeStyle = layer.style.outline.color;
    ctx.lineWidth = layer.style.outline.width * scale;
    ctx.lineJoin = 'round';
    drawLines((line, x, y) => ctx.strokeText(line, x, y));
  }

  // Fill pass.
  ctx.fillStyle = layer.style.color;
  drawLines((line, x, y) => ctx.fillText(line, x, y));

  ctx.restore();
}
