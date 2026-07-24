import type { TextFontId } from '../../shared/directorSchemas';

/**
 * Pure font metadata shared by the renderer, the loader, and the inspector.
 * No DOM access here so it is safe to import in node tests. Files are bundled
 * locally under `/fonts` and loaded via @font-face — never from a CDN.
 */
export type FontCatalogEntry = {
  id: TextFontId;
  /** CSS font-family name used in the canvas `font` string and @font-face. */
  family: string;
  label: string;
  /** Bundled woff2 filename under public/fonts. */
  file: string;
  /** Whether a real bold weight exists; single-weight display faces fall back to 400. */
  hasBold: boolean;
  note: string;
};

export const FONT_CATALOG: Record<TextFontId, FontCatalogEntry> = {
  inter: { id: 'inter', family: 'Inter', label: 'Inter', file: 'inter.woff2', hasBold: true, note: 'UI-neutral' },
  'space-grotesk': { id: 'space-grotesk', family: 'Space Grotesk', label: 'Space Grotesk', file: 'space-grotesk.woff2', hasBold: true, note: 'Modern' },
  'playfair-display': { id: 'playfair-display', family: 'Playfair Display', label: 'Playfair Display', file: 'playfair-display.woff2', hasBold: true, note: 'Editorial serif' },
  'bebas-neue': { id: 'bebas-neue', family: 'Bebas Neue', label: 'Bebas Neue', file: 'bebas-neue.woff2', hasBold: false, note: 'Poster caps' },
  'jetbrains-mono': { id: 'jetbrains-mono', family: 'JetBrains Mono', label: 'JetBrains Mono', file: 'jetbrains-mono.woff2', hasBold: true, note: 'Technical' },
};

export const FONT_LIST: FontCatalogEntry[] = Object.values(FONT_CATALOG);

export function fontFamily(id: TextFontId): string {
  return FONT_CATALOG[id]?.family ?? 'Inter';
}

/** CSS numeric weight, folding bold down to 400 for single-weight faces. */
export function fontWeightValue(id: TextFontId, weight: 'regular' | 'bold'): 400 | 700 {
  return weight === 'bold' && (FONT_CATALOG[id]?.hasBold ?? true) ? 700 : 400;
}
