import { FONT_LIST } from './fontCatalog';

let readyPromise: Promise<void> | null = null;

/**
 * Ensure the bundled text fonts are loaded before any canvas text is measured
 * or drawn. `measureText`/`fillText` silently fall back to a system font until
 * the FontFace resolves, which would break both wrapping and preview↔export
 * WYSIWYG — so both the preview's first draw and every export PNG await this.
 *
 * The @font-face declarations live in `fonts.css`; this just forces the browser
 * to load the specific families/weights and waits for `document.fonts.ready`.
 */
export function ensureTextFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    try {
      await Promise.all(FONT_LIST.flatMap((font) => {
        const requests = [document.fonts.load(`400 32px "${font.family}"`)];
        if (font.hasBold) requests.push(document.fonts.load(`700 32px "${font.family}"`));
        return requests;
      }));
      await document.fonts.ready;
    } catch {
      // A font that fails to load falls back to sans-serif; never block rendering.
    }
  })();
  return readyPromise;
}

/** Test-only reset of the memoized readiness promise. */
export function resetTextFontsReadyForTests(): void {
  readyPromise = null;
}
