export const CANONICAL_REEL_VISUAL_EFFECTS = [
  'none',
  'pixel-sort',
  'glitch-burst',
  'crt-scan',
  'halftone-reveal',
  'ripple-drift',
  'motion-echo',
  'threshold-melt',
] as const;

export const RETIRED_REEL_VISUAL_EFFECTS = [
  'rgb-split',
  'film-grain',
  'scanlines',
  'glow',
  'dream',
  'vignette',
  'blur',
  'loop',
  'halation',
  'anamorphic-bloom',
] as const;

export const DIRECTOR_VISUAL_EFFECT_VOCABULARY = [
  ...CANONICAL_REEL_VISUAL_EFFECTS,
  ...RETIRED_REEL_VISUAL_EFFECTS,
] as const;

export type CanonicalReelVisualEffect = typeof CANONICAL_REEL_VISUAL_EFFECTS[number];
export type RetiredReelVisualEffect = typeof RETIRED_REEL_VISUAL_EFFECTS[number];
export type DirectorVisualEffectVocabulary = typeof DIRECTOR_VISUAL_EFFECT_VOCABULARY[number];

type LegacyResolution = {
  id: CanonicalReelVisualEffect;
  notice: string;
};

export const LEGACY_VISUAL_EFFECT_RESOLUTIONS: Record<RetiredReelVisualEffect, LegacyResolution> = {
  'rgb-split': {
    id: 'glitch-burst',
    notice: 'RGB split is now Glitch burst.',
  },
  scanlines: {
    id: 'crt-scan',
    notice: 'Scanlines is now CRT scan.',
  },
  'film-grain': {
    id: 'none',
    notice: 'Film grain was retired; try the Vintage film color grade for the closest available finish.',
  },
  glow: {
    id: 'none',
    notice: 'Soft glow was retired; try the HDR look color grade for the closest available finish.',
  },
  dream: {
    id: 'none',
    notice: 'Dream haze was retired; try the Vintage film color grade for the closest available finish.',
  },
  vignette: {
    id: 'none',
    notice: 'Vignette was retired as a visual effect; try the Cinematic color grade instead.',
  },
  blur: {
    id: 'none',
    notice: 'Defocus blur was retired; the Cinematic color grade is the closest softer finish.',
  },
  loop: {
    id: 'none',
    notice: 'Loop pulse was retired; try the Cinematic color grade with Float motion instead.',
  },
  halation: {
    id: 'none',
    notice: 'Film halation was retired; try the Vintage film color grade for the closest available finish.',
  },
  'anamorphic-bloom': {
    id: 'none',
    notice: 'Anamorphic bloom was retired; try the HDR look color grade for the closest available finish.',
  },
};

export function isCanonicalReelVisualEffect(value: unknown): value is CanonicalReelVisualEffect {
  return typeof value === 'string'
    && (CANONICAL_REEL_VISUAL_EFFECTS as readonly string[]).includes(value);
}

export function isRetiredReelVisualEffect(value: unknown): value is RetiredReelVisualEffect {
  return typeof value === 'string'
    && (RETIRED_REEL_VISUAL_EFFECTS as readonly string[]).includes(value);
}

export function resolveReelVisualEffect(value: unknown) {
  if (isCanonicalReelVisualEffect(value)) return { id: value, notice: null, retiredId: null } as const;
  if (isRetiredReelVisualEffect(value)) {
    const resolution = LEGACY_VISUAL_EFFECT_RESOLUTIONS[value];
    return { ...resolution, retiredId: value };
  }
  return null;
}
