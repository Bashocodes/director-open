import type { ReelAspectRatio } from '../../../shared/directorSchemas';
import { composeClipFrame } from './clipFrameComposer';
import type { ReelClip } from './types';

/**
 * Still export.
 *
 * Applying a look to a single image must not cost a video encode. This path
 * never loads FFmpeg: it composes one frame through the same
 * {@link composeClipFrame} the player uses and hands back an encoded image,
 * so a person who only wants a graded picture gets it in milliseconds.
 */

export type StillFormat = 'png' | 'jpeg' | 'webp';

export type StillSizeId = 'source' | 'reel' | 'square-2048' | 'print-4096';

export type StillSize = {
  id: StillSizeId;
  label: string;
  description: string;
  /** Short edge in pixels; `null` means "follow the source image". */
  shortEdge: number | null;
};

export const STILL_SIZES: readonly StillSize[] = [
  {
    id: 'source',
    label: 'Source resolution',
    description: 'Full detail of the imported image, cropped to the chosen frame.',
    shortEdge: null,
  },
  { id: 'reel', label: 'Reel frame · 1080', description: 'Matches the reel output frame.', shortEdge: 1_080 },
  { id: 'square-2048', label: 'Large · 2048', description: 'Oversized for print or further editing.', shortEdge: 2_048 },
  { id: 'print-4096', label: 'Maximum · 4096', description: 'Slowest; effects run over four times the pixels.', shortEdge: 4_096 },
];

export const STILL_FORMATS: ReadonlyArray<{ id: StillFormat; label: string; description: string; extension: string }> = [
  { id: 'png', label: 'PNG', description: 'Lossless. Largest file.', extension: 'png' },
  { id: 'jpeg', label: 'JPEG', description: 'Small file, best for sharing.', extension: 'jpg' },
  { id: 'webp', label: 'WebP', description: 'Small file, keeps more detail than JPEG.', extension: 'webp' },
];

const MIME_TYPES: Record<StillFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Hard ceiling so a huge source cannot allocate an unrenderable canvas. */
const MAX_EDGE = 8_192;

export function stillDimensions(options: {
  aspectRatio: ReelAspectRatio;
  size: StillSize;
  sourceWidth: number;
  sourceHeight: number;
}) {
  const { aspectRatio, size, sourceWidth, sourceHeight } = options;
  const ratio = aspectRatio === '9:16' ? 9 / 16 : aspectRatio === '16:9' ? 16 / 9 : 1;
  // "Source" keeps as much of the original detail as the crop allows: use the
  // largest frame of the requested shape that the source can fill without upscaling.
  const shortEdge = size.shortEdge
    ?? (ratio >= 1 ? Math.min(sourceHeight, Math.round(sourceWidth / ratio)) : Math.min(sourceWidth, Math.round(sourceHeight * ratio)));
  const safeShort = Math.max(64, Math.min(shortEdge, MAX_EDGE));
  const width = ratio >= 1 ? Math.round(safeShort * ratio) : safeShort;
  const height = ratio >= 1 ? safeShort : Math.round(safeShort / ratio);
  return {
    width: Math.min(width, MAX_EDGE),
    height: Math.min(height, MAX_EDGE),
  };
}

export function stillFileName(clipTitle: string, extension: string) {
  const base = clipTitle
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase();
  return `${base || 'director-still'}.${extension}`;
}

export type RenderStillOptions = {
  image: CanvasImageSource;
  clip: ReelClip;
  aspectRatio: ReelAspectRatio;
  fps: number;
  size: StillSize;
  format: StillFormat;
  /** 0..1 for lossy formats. Ignored for PNG. */
  quality?: number;
  /**
   * Which moment of the clip to freeze, 0..1. Effects and camera moves animate,
   * so the exported still must name the instant it captured.
   */
  progress?: number;
  sourceWidth: number;
  sourceHeight: number;
};

export type RenderedStill = {
  blob: Blob;
  width: number;
  height: number;
  format: StillFormat;
  progress: number;
  elapsedMs: number;
};

export async function renderStill(options: RenderStillOptions): Promise<RenderedStill> {
  const started = performance.now();
  const progress = clampUnit(options.progress ?? 0);
  const { width, height } = stillDimensions({
    aspectRatio: options.aspectRatio,
    size: options.size,
    sourceWidth: options.sourceWidth,
    sourceHeight: options.sourceHeight,
  });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Director could not create the still-export canvas.');

  composeClipFrame({
    context,
    image: options.image,
    clip: options.clip,
    width,
    height,
    progress,
    localTime: progress * options.clip.duration,
    fps: options.fps,
    fidelity: 'full',
  });

  const blob = await encodeCanvas(canvas, options.format, options.quality);
  return {
    blob,
    width,
    height,
    format: options.format,
    progress,
    elapsedMs: performance.now() - started,
  };
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

async function encodeCanvas(canvas: HTMLCanvasElement, format: StillFormat, quality?: number) {
  const mimeType = MIME_TYPES[format];
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      resolve,
      mimeType,
      format === 'png' ? undefined : clampUnit(quality ?? 0.92),
    );
  });
  if (!blob) throw new Error(`Director could not encode the still as ${format.toUpperCase()}.`);
  // Safari silently falls back to PNG for unsupported types; report what we got.
  if (blob.type && blob.type !== mimeType) {
    throw new Error(
      `This browser does not support ${format.toUpperCase()} export. Choose PNG or JPEG.`,
    );
  }
  return blob;
}
