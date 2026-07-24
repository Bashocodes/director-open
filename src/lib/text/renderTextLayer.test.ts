import { describe, expect, it } from 'vitest';
import { createTextLayer } from '../../shared/textLayers';
import type { TextLayer } from '../../shared/directorSchemas';
import {
  renderTextLayer,
  resolveTextLayerAlpha,
  withOpacity,
  wrapTextLines,
  type Text2DContext,
} from './renderTextLayer';

/**
 * Deterministic recording 2D context. The test environment (jsdom) has no
 * canvas text rasterizer, so pixel-PNG goldens cannot run here; instead we
 * golden-compare the ordered draw-op stream, which captures every state change
 * (font, align, fill/stroke, alpha, shadow, transform) that determines pixels.
 */
class RecordingContext implements Text2DContext {
  ops: string[] = [];
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  fillStyle: string | CanvasGradient | CanvasPattern = '#000000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000000';
  lineWidth = 1;
  lineJoin: CanvasLineJoin = 'miter';
  globalAlpha = 1;
  shadowColor = 'transparent';
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  letterSpacing = '0px';

  private fontPx() {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    return match ? Number(match[1]) : 16;
  }
  save() { this.ops.push('save'); }
  restore() { this.ops.push('restore'); }
  translate(x: number, y: number) { this.ops.push(`translate(${round(x)},${round(y)})`); }
  rotate(a: number) { this.ops.push(`rotate(${round(a)})`); }
  measureText(text: string) { return { width: text.length * this.fontPx() * 0.5 }; }
  fillText(text: string, x: number, y: number) {
    this.ops.push(`fillText("${text}",${round(x)},${round(y)}) align=${this.textAlign} fill=${String(this.fillStyle)} a=${round(this.globalAlpha)} shadow=${this.shadowColor}/${round(this.shadowBlur)}`);
  }
  strokeText(text: string, x: number, y: number) {
    this.ops.push(`strokeText("${text}",${round(x)},${round(y)}) w=${round(this.lineWidth)} stroke=${String(this.strokeStyle)}`);
  }
  fillRect(x: number, y: number, w: number, h: number) { this.ops.push(`fillRect(${round(x)},${round(y)},${round(w)},${round(h)}) fill=${String(this.fillStyle)}`); }
  beginPath() { this.ops.push('beginPath'); }
  rect() { /* unused when roundRect present */ }
  roundRect(x: number, y: number, w: number, h: number, r: number) { this.ops.push(`roundRect(${round(x)},${round(y)},${round(w)},${round(h)},${round(r)}) fill=${String(this.fillStyle)}`); }
  fill() { this.ops.push('fill'); }
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

const baseLayer = (over: Partial<TextLayer> = {}): TextLayer => ({
  ...createTextLayer('layer-1', { content: 'Hello world', clipDuration: 5 }),
  x: 0.5,
  y: 0.5,
  anchor: 'center',
  ...over,
});

describe('resolveTextLayerAlpha', () => {
  const timing = { inSec: 1, outSec: 4, fadeInSec: 1, fadeOutSec: 1 };
  it('is 0 outside the window', () => {
    expect(resolveTextLayerAlpha(timing, 0.5)).toBe(0);
    expect(resolveTextLayerAlpha(timing, 4.5)).toBe(0);
  });
  it('ramps in and out linearly and holds at full', () => {
    expect(resolveTextLayerAlpha(timing, 1)).toBe(0);
    expect(resolveTextLayerAlpha(timing, 1.5)).toBeCloseTo(0.5, 5);
    expect(resolveTextLayerAlpha(timing, 2.5)).toBe(1);
    expect(resolveTextLayerAlpha(timing, 3.5)).toBeCloseTo(0.5, 5);
    expect(resolveTextLayerAlpha(timing, 4)).toBe(0);
  });
  it('holds full with no fades', () => {
    expect(resolveTextLayerAlpha({ inSec: 0, outSec: 5, fadeInSec: 0, fadeOutSec: 0 }, 2.5)).toBe(1);
  });
});

describe('wrapTextLines', () => {
  it('honors explicit newlines and word-wraps to width', () => {
    const ctx = new RecordingContext();
    ctx.font = '400 20px "Inter", sans-serif';
    expect(wrapTextLines(ctx, 'one\ntwo three', 40)).toEqual(['one', 'two', 'three']);
  });
});

describe('withOpacity', () => {
  it('multiplies hex color by opacity into rgba', () => {
    expect(withOpacity('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(withOpacity('#000000ff', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });
});

describe('renderTextLayer op-stream goldens', () => {
  it('draws a scrim + shadow + outline + fill layer deterministically', () => {
    const ctx = new RecordingContext();
    const layer = baseLayer({
      content: 'GOLDEN',
      style: {
        ...baseLayer().style,
        fontId: 'bebas-neue', sizePreset: 'L', sizePx: 96, weight: 'bold', color: '#ffcc00',
        case: 'upper', align: 'center',
        background: { kind: 'scrim', color: '#000000', opacity: 0.5 },
        outline: { color: '#101010', width: 6 },
        shadow: { color: '#000000', blur: 12, offsetX: 0, offsetY: 3 },
      },
    });
    renderTextLayer(ctx, layer, { width: 1080, height: 1920, alpha: 1 });
    expect(ctx.ops).toMatchInlineSnapshot(`
      [
        "save",
        "translate(540,960)",
        "beginPath",
        "roundRect(-182.4,-82.08,364.8,164.16,48) fill=rgba(0, 0, 0, 0.5)",
        "fill",
        "fillText("GOLDEN",0,-48) align=center fill=#ffcc00 a=1 shadow=#000000/12",
        "strokeText("GOLDEN",0,-48) w=6 stroke=#101010",
        "fillText("GOLDEN",0,-48) align=center fill=#ffcc00 a=1 shadow=transparent/0",
        "restore",
      ]
    `);
  });

  it('applies rotation and left alignment', () => {
    const ctx = new RecordingContext();
    const layer = baseLayer({
      content: 'Tilt',
      x: 0.25, y: 0.4, anchor: 'top-left', rotation: 15,
      style: { ...baseLayer().style, align: 'left', sizePx: 60, background: { kind: 'none', color: '#000', opacity: 0.5 }, shadow: { color: '#000', blur: 0, offsetX: 0, offsetY: 0 }, outline: { color: '#000', width: 0 } },
    });
    renderTextLayer(ctx, layer, { width: 1080, height: 1920, alpha: 0.8 });
    expect(ctx.ops).toMatchInlineSnapshot(`
      [
        "save",
        "translate(270,768)",
        "rotate(0.26)",
        "fillText("Tilt",0,4.5) align=left fill=#ffffff a=0.8 shadow=transparent/0",
        "restore",
      ]
    `);
  });
});

describe('renderTextLayer normalized position math', () => {
  it('scales identically across 540x960, 1080x1920, and 2160x3840', () => {
    const layer = baseLayer({ content: 'X', x: 0.5, y: 0.25, anchor: 'center', style: { ...baseLayer().style, sizePx: 80, background: { kind: 'none', color: '#000', opacity: 0 }, shadow: { color: '#000', blur: 0, offsetX: 0, offsetY: 0 }, outline: { color: '#000', width: 0 } } });
    const coordsAt = (w: number, h: number) => {
      const ctx = new RecordingContext();
      renderTextLayer(ctx, layer, { width: w, height: h, alpha: 1 });
      const translate = ctx.ops.find((op) => op.startsWith('translate'))!;
      const fill = ctx.ops.find((op) => op.startsWith('fillText'))!;
      return { translate, fill };
    };
    const half = coordsAt(540, 960);
    const full = coordsAt(1080, 1920);
    const double = coordsAt(2160, 3840);
    // Anchor point is x*width, y*height at every resolution.
    expect(half.translate).toBe('translate(270,240)');
    expect(full.translate).toBe('translate(540,480)');
    expect(double.translate).toBe('translate(1080,960)');
    // Glyph baseline y offset scales linearly (font px scales with width).
    expect(half.fill).toContain(',-20)');
    expect(full.fill).toContain(',-40)');
    expect(double.fill).toContain(',-80)');
  });
});
