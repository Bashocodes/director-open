import type { CSSProperties } from 'react';

/**
 * Single source of truth for the Director workspace design system.
 *
 * These values are injected onto the `.director-page` root as CSS custom
 * properties (see {@link directorTokenStyle}) and consumed across the stylesheets
 * as `var(--ds-*)`. Keeping them here — rather than scattered literal pixels —
 * lets the type/spacing/legibility rules move as one unit and stay snapshot-tested.
 *
 * Type scale floor is 11px (uppercase tracked eyebrows only); body copy is >=12px.
 * There is deliberately no sub-11px step: the app must not render illegible text.
 */
export const designTokens = {
  /** Type scale in px. `eyebrow` (11px) is reserved for uppercase, letter-spaced labels. */
  type: {
    eyebrow: '11px',
    xs: '12px',
    sm: '13px',
    base: '14px',
    md: '16px',
    lg: '20px',
    display: '24px',
    displayLg: '30px',
  },
  /** 4px-based spacing scale. */
  space: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '32px',
  },
  /** Corner radii. */
  radius: {
    1: '8px',
    2: '10px',
    3: '14px',
    4: '18px',
    5: '24px',
    pill: '999px',
  },
  /**
   * Ordered stacking scale. Every absolutely/fixed-positioned surface picks a
   * layer from here instead of a bare literal, so overlaps are resolved by name.
   */
  z: {
    base: '1',
    canvasOverlay: '5',
    chrome: '20',
    rail: '26',
    panel: '40',
    drawerBackdrop: '80',
    drawer: '90',
    popover: '140',
    renderDetails: '150',
    fullscreen: '500',
  },
  /** Fixed layout dimensions referenced by the workspace grid. */
  layout: {
    chatRail: '52px',
    drawerWidth: '340px',
    timelineHeight: '194px',
  },
} as const;

type FlatTokens = Record<string, string>;

function flatten(): FlatTokens {
  const flat: FlatTokens = {};
  for (const [size, value] of Object.entries(designTokens.type)) flat[`--ds-text-${size}`] = value;
  for (const [step, value] of Object.entries(designTokens.space)) flat[`--ds-space-${step}`] = value;
  for (const [step, value] of Object.entries(designTokens.radius)) flat[`--ds-radius-${step}`] = value;
  for (const [layer, value] of Object.entries(designTokens.z)) flat[`--ds-z-${layer}`] = value;
  flat['--ds-chat-rail'] = designTokens.layout.chatRail;
  flat['--ds-drawer-w'] = designTokens.layout.drawerWidth;
  flat['--ds-timeline-h'] = designTokens.layout.timelineHeight;
  return flat;
}

/**
 * The token set as a React style object of CSS custom properties. Applied to the
 * workspace root so every descendant stylesheet resolves `var(--ds-*)`.
 */
export function directorTokenStyle(): CSSProperties {
  return flatten() as CSSProperties;
}

/** Flat `--ds-*` → value map. Exposed for tests and non-React consumers. */
export function directorTokenVariables(): FlatTokens {
  return flatten();
}
