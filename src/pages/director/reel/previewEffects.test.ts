import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReelClip } from './types';
import { effectSeed, pixelSortMorphologySampleAtProgress } from './effectRecipes';

const pixelSortMock = vi.hoisted(() => vi.fn((source: Uint8ClampedArray) => source.slice()));

vi.mock('./pixelSortEngine', () => ({ pixelSortRgba: pixelSortMock }));

import { applyPreviewVisualEffect } from './previewEffects';

type DrawRecord = { alpha: number; smoothing: boolean; args: unknown[] };

class FakeCanvasContext {
  canvas: FakeCanvas;
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  globalCompositeOperation = 'source-over';
  filter = 'none';
  fillStyle: string | CanvasGradient = '';
  drawRecords: DrawRecord[] = [];
  private stack: Array<{ alpha: number; smoothing: boolean }> = [];

  constructor(canvas: FakeCanvas) { this.canvas = canvas; }
  save() { this.stack.push({ alpha: this.globalAlpha, smoothing: this.imageSmoothingEnabled }); }
  restore() {
    const state = this.stack.pop();
    if (state) {
      this.globalAlpha = state.alpha;
      this.imageSmoothingEnabled = state.smoothing;
    }
  }
  clearRect() {}
  drawImage(...args: unknown[]) {
    this.drawRecords.push({ alpha: this.globalAlpha, smoothing: this.imageSmoothingEnabled, args });
  }
  getImageData(_x: number, _y: number, width: number, height: number) {
    return { data: new Uint8ClampedArray(width * height * 4) } as ImageData;
  }
  putImageData() {}
}

class FakeCanvas {
  width = 0;
  height = 0;
  dataset: Record<string, string> = {};
  context = new FakeCanvasContext(this);
  getContext() { return this.context; }
}

const clip: ReelClip = {
  id: 'preview-clip',
  objectId: null,
  title: 'Preview',
  imageUrl: 'blob:local-preview',
  duration: 6.4,
  effect: 'clean',
  visualEffect: 'pixel-sort',
  visualEffectStack: ['pixel-sort'],
  transition: 'cut',
  transitionDuration: 0,
  motion: 'still',
  intensity: 62,
  caption: '',
};

function fakeContext(width = 540, height = 960) {
  const canvas = new FakeCanvas();
  canvas.width = width;
  canvas.height = height;
  return canvas.context as unknown as CanvasRenderingContext2D;
}

describe('Canvas visual-effect preview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    pixelSortMock.mockClear();
    const nativeCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string, options?: ElementCreationOptions) => (
      tagName.toLowerCase() === 'canvas'
        ? new FakeCanvas() as unknown as HTMLCanvasElement
        : nativeCreateElement(tagName, options)
    ));
  });

  it('keeps clean envelope frames completely untouched', () => {
    const context = fakeContext();
    const metrics = applyPreviewVisualEffect({
      context,
      clip,
      effect: 'pixel-sort',
      width: 540,
      height: 960,
      progress: 0,
      fps: 24,
    });
    expect(metrics).toBeUndefined();
    expect(pixelSortMock).not.toHaveBeenCalled();
    expect((context as unknown as FakeCanvasContext).drawRecords).toHaveLength(0);
  });

  it('uses the shared export sample at 75% resolution and composites it crisply at full opacity', () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(120);
    const context = fakeContext();
    const metrics = applyPreviewVisualEffect({
      context,
      clip,
      effect: 'pixel-sort',
      width: 540,
      height: 960,
      progress: 0.5,
      fps: 24,
    });
    const sample = pixelSortMorphologySampleAtProgress(
      0.5,
      clip.duration,
      24,
      effectSeed(`${clip.id}:pixel-sort`),
    );
    expect(metrics).toMatchObject({
      sortMs: 20,
      workWidth: 405,
      workHeight: 720,
      scale: 0.75,
      morphologyFrame: sample.frameIndex,
      phase: sample.phase,
      cacheHit: false,
    });
    expect(pixelSortMock).toHaveBeenCalledWith(
      expect.any(Uint8ClampedArray),
      405,
      720,
      { intensity: 62, seed: sample.seed, phase: sample.phase },
    );
    const finalDraw = (context as unknown as FakeCanvasContext).drawRecords.at(-1);
    expect(finalDraw).toMatchObject({ alpha: 1, smoothing: false });
  });

  it('falls back one resolution notch after a slow 75% sort and logs only once', () => {
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0).mockReturnValueOnce(40)
      .mockReturnValueOnce(50).mockReturnValueOnce(60)
      .mockReturnValueOnce(70).mockReturnValueOnce(80);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const context = fakeContext();
    for (const progress of [0.5, 0.54, 0.58]) {
      applyPreviewVisualEffect({ context, clip, effect: 'pixel-sort', width: 540, height: 960, progress, fps: 24 });
    }
    expect(pixelSortMock.mock.calls[0].slice(1, 3)).toEqual([405, 720]);
    expect(pixelSortMock.mock.calls[1].slice(1, 3)).toEqual([281, 500]);
    expect(pixelSortMock.mock.calls[2].slice(1, 3)).toEqual([281, 500]);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('using 52% resolution next frame'));
  });
});
