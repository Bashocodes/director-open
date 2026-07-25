import type {
  ReelAspectRatio,
  ReelQuality,
} from '../../../shared/directorSchemas';
import { pluginOptions } from '../../../plugins/registry';

type CatalogItem<T extends string> = { id: T; label: string; description: string };

export const REEL_GRADES = pluginOptions('effect', 'grade');

export const REEL_VISUAL_EFFECTS = pluginOptions('effect', 'visual');

/** Backwards-compatible export for older imports; these are grades, not visual effects. */
export const REEL_EFFECTS = REEL_GRADES;

export const REEL_TRANSITIONS = pluginOptions('transition');

export const REEL_MOTIONS = pluginOptions('motion');

export const REEL_FORMATS: Array<CatalogItem<ReelAspectRatio>> = [
  { id: '9:16', label: 'Reel 9:16', description: '' },
  { id: '1:1', label: 'Square 1:1', description: '' },
  { id: '16:9', label: 'Wide 16:9', description: '' },
];

export const REEL_QUALITIES: Array<CatalogItem<ReelQuality>> = [
  { id: 'draft', label: 'Draft · 540p', description: 'Fastest. For checking timing and motion; fine texture will soften.' },
  { id: 'balanced', label: 'Balanced · 720p', description: 'Good for sharing. Postable file size and a render you will wait through.' },
  { id: 'high', label: 'High · 1080p', description: 'Full resolution for a final post. Noticeably slower than Balanced.' },
  { id: 'maximum', label: 'Maximum · 1080p master', description: 'Archival master, barely different on a phone. Slowest, and files can exceed what social platforms accept.' },
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
