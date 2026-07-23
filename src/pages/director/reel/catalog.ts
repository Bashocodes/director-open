import type {
  ReelAspectRatio,
  ReelEffect,
  ReelMotion,
  ReelQuality,
  ReelTransition,
  ReelVisualEffect,
} from '../../../shared/directorSchemas';

type CatalogItem<T extends string> = { id: T; label: string; description: string };

export const REEL_GRADES: Array<CatalogItem<ReelEffect>> = [
  { id: 'clean', label: 'Clean', description: 'Neutral grade with source detail intact.' },
  { id: 'cinematic', label: 'Cinematic', description: 'Restrained saturation, richer contrast, subtle vignette.' },
  { id: 'hdr', label: 'HDR look', description: 'Highlight-safe tone curve, local contrast, and restrained micro-detail.' },
  { id: 'warm', label: 'Warm', description: 'Amber-biased highlights and softened blue response.' },
  { id: 'cool', label: 'Cool', description: 'Steel-blue shadows and controlled warmth.' },
  { id: 'mono', label: 'Monochrome', description: 'High-contrast black and white treatment.' },
  { id: 'punch', label: 'Punchy detail', description: 'Dense contrast, saturated color, and crisp edges.' },
  { id: 'teal-orange', label: 'Teal + orange', description: 'Cool shadows with warm skin-biased highlights.' },
  { id: 'vintage-film', label: 'Vintage film', description: 'Faded warmth, restrained saturation, and fine grain.' },
  { id: 'bleach-bypass', label: 'Bleach bypass', description: 'Desaturated metallic contrast for a severe cinematic finish.' },
];

export const REEL_VISUAL_EFFECTS: Array<CatalogItem<ReelVisualEffect>> = [
  { id: 'none', label: 'None', description: 'No structural visual effect.' },
  { id: 'pixel-sort', label: 'Pixel sort', description: 'Luminance-sorted tears grow across the frame, then recover cleanly.' },
  { id: 'glitch-burst', label: 'Glitch burst', description: 'Seeded digital slice hits with abrupt clean recovery frames.' },
  { id: 'crt-scan', label: 'CRT scan', description: 'Fine moving raster lines and a restrained rolling sync disturbance.' },
  { id: 'halftone-reveal', label: 'Halftone reveal', description: 'The image resolves into an editorial monochrome dot grid and back.' },
  { id: 'ripple-drift', label: 'Ripple drift', description: 'Slow crossed-wave displacement bends the frame like liquid.' },
  { id: 'motion-echo', label: 'Motion echo', description: 'Camera movement leaves decaying highlight trails that clear before the loop.' },
  { id: 'threshold-melt', label: 'Threshold melt', description: 'Color sweeps into a crawling two-tone print treatment, then resolves.' },
];

/** Backwards-compatible export for older imports; these are grades, not visual effects. */
export const REEL_EFFECTS = REEL_GRADES;

export const REEL_TRANSITIONS: Array<CatalogItem<ReelTransition>> = [
  { id: 'cut', label: 'Cut', description: 'Immediate editorial cut.' },
  { id: 'crossfade', label: 'Crossfade', description: 'Classic opacity dissolve.' },
  { id: 'dip-black', label: 'Dip to black', description: 'Cinematic breath through black.' },
  { id: 'slide-left', label: 'Slide left', description: 'Next frame enters from the right.' },
  { id: 'slide-right', label: 'Slide right', description: 'Next frame enters from the left.' },
  { id: 'zoom', label: 'Iris reveal', description: 'Circular reveal with a focused center.' },
  { id: 'soft-dissolve', label: 'Soft dissolve', description: 'Textured dissolve for atmospheric edits.' },
];

export const REEL_MOTIONS: Array<CatalogItem<ReelMotion>> = [
  { id: 'still', label: 'Still', description: 'No virtual camera movement.' },
  { id: 'push-in', label: 'Push in', description: 'Slow, centered scale toward the subject.' },
  { id: 'pull-out', label: 'Pull out', description: 'Slow reveal from detail to wider frame.' },
  { id: 'pan-left', label: 'Pan left', description: 'Traverse from right to left.' },
  { id: 'pan-right', label: 'Pan right', description: 'Traverse from left to right.' },
  { id: 'pan-up', label: 'Pan up', description: 'Rise through the composition.' },
  { id: 'pan-down', label: 'Pan down', description: 'Descend through the composition.' },
  { id: 'drift-up-left', label: 'Drift up + left', description: 'A slow diagonal float toward the upper-left.' },
  { id: 'drift-down-right', label: 'Drift down + right', description: 'A slow diagonal float toward the lower-right.' },
  { id: 'pulse', label: 'Cinematic pulse', description: 'A restrained push in and ease back.' },
  { id: 'hero-push', label: 'Hero push', description: 'A stronger eased push with an upward subject reveal.' },
  { id: 'arc-left', label: 'Arc left', description: 'A curved leftward move that rises gently through the midpoint.' },
  { id: 'arc-right', label: 'Arc right', description: 'A curved rightward move that rises gently through the midpoint.' },
  { id: 'float', label: 'Looping float', description: 'A seamless figure-eight drift with a quiet optical breath.' },
];

export const REEL_FORMATS: Array<CatalogItem<ReelAspectRatio>> = [
  { id: '9:16', label: 'Reel 9:16', description: '' },
  { id: '1:1', label: 'Square 1:1', description: '' },
  { id: '16:9', label: 'Wide 16:9', description: '' },
];

export const REEL_QUALITIES: Array<CatalogItem<ReelQuality>> = [
  { id: 'draft', label: 'Draft preview', description: '540p fast preview — visual effects will soften.' },
  { id: 'balanced', label: 'Balanced preview', description: '720p preview — visual effects will soften.' },
  { id: 'high', label: 'High · Recommended', description: '1080p recommended final export with stronger texture retention.' },
  { id: 'maximum', label: 'Maximum', description: '1080p, low-compression master; slowest and largest.' },
];

export const QUALITY_SHORT_EDGE: Record<ReelQuality, number> = {
  draft: 540,
  balanced: 720,
  high: 1_080,
  maximum: 1_080,
};

export function reelDimensions(aspectRatio: ReelAspectRatio, quality: ReelQuality) {
  const short = QUALITY_SHORT_EDGE[quality];
  if (aspectRatio === '9:16') return { width: short, height: Math.round(short * 16 / 9) };
  if (aspectRatio === '16:9') return { width: Math.round(short * 16 / 9), height: short };
  return { width: short, height: short };
}
