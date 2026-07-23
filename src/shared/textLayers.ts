import {
  MAX_TEXT_LAYERS_PER_CLIP,
  type TextLayer,
  type TextLayerStyle,
  type TextSizePreset,
} from './directorSchemas';

export { MAX_TEXT_LAYERS_PER_CLIP };

/** Preset glyph sizes in px at the 1080-wide reference. */
export const TEXT_SIZE_PRESET_PX: Record<Exclude<TextSizePreset, 'custom'>, number> = {
  S: 44,
  M: 64,
  L: 96,
  XL: 140,
};

export function sizePresetToPx(preset: TextSizePreset, customPx: number): number {
  return preset === 'custom' ? customPx : TEXT_SIZE_PRESET_PX[preset];
}

export function defaultTextLayerStyle(overrides: Partial<TextLayerStyle> = {}): TextLayerStyle {
  return {
    fontId: 'inter',
    sizePreset: 'M',
    sizePx: TEXT_SIZE_PRESET_PX.M,
    weight: 'bold',
    italic: false,
    color: '#ffffff',
    letterSpacing: 0,
    lineHeight: 1.15,
    align: 'center',
    case: 'none',
    background: { kind: 'none', color: '#000000', opacity: 0.5 },
    outline: { color: '#000000', width: 0 },
    shadow: { color: '#000000', blur: 8, offsetX: 0, offsetY: 2 },
    ...overrides,
  };
}

type CreateTextLayerOptions = {
  content?: string;
  x?: number;
  y?: number;
  clipDuration?: number;
  style?: Partial<TextLayerStyle>;
  timing?: Partial<TextLayer['timing']>;
  anchor?: TextLayer['anchor'];
  widthFraction?: number;
};

/** A new centered text layer with legible defaults, timed to the whole clip. */
export function createTextLayer(id: string, options: CreateTextLayerOptions = {}): TextLayer {
  const clipDuration = Number.isFinite(options.clipDuration) && (options.clipDuration ?? 0) > 0
    ? (options.clipDuration as number)
    : 5;
  return {
    id,
    content: options.content ?? 'Text',
    x: options.x ?? 0.5,
    y: options.y ?? 0.5,
    anchor: options.anchor ?? 'center',
    widthFraction: options.widthFraction ?? 0.86,
    rotation: 0,
    style: defaultTextLayerStyle(options.style),
    timing: {
      inSec: 0,
      outSec: clipDuration,
      fadeInSec: 0,
      fadeOutSec: 0,
      ...options.timing,
    },
  };
}

/**
 * Convert a legacy single caption string into one bottom-centered text layer
 * with the default caption look, spanning the whole clip. Deterministic id so
 * the schema migration is idempotent and testable.
 */
export function migrateCaptionToTextLayer(
  caption: string,
  clipId: string,
  clipDuration: number,
): TextLayer {
  return createTextLayer(`${clipId}-caption`, {
    content: caption.slice(0, 180),
    x: 0.5,
    y: 0.86,
    anchor: 'bottom-center',
    clipDuration,
    style: {
      color: '#f4f1eb',
      weight: 'bold',
      shadow: { color: '#000000', blur: 14, offsetX: 0, offsetY: 2 },
      background: { kind: 'scrim', color: '#000000', opacity: 0.42 },
    },
  });
}

/** Apply the size preset → px relationship so `sizePx` stays the render input. */
export function withResolvedSizePx(style: TextLayerStyle): TextLayerStyle {
  return style.sizePreset === 'custom'
    ? style
    : { ...style, sizePx: sizePresetToPx(style.sizePreset, style.sizePx) };
}
