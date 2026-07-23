/**
 * First-principles easing curves. No third-party easing library (constraint).
 * Every curve satisfies f(0) = 0 and f(1) = 1, so an eased transition still
 * returns exactly frameA at progress 0 and frameB at progress 1.
 */
export const EASING_CURVES = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'smootherstep',
] as const;

export type EasingCurve = (typeof EASING_CURVES)[number];

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function applyEasing(curve: EasingCurve, t: number): number {
  const x = clamp01(t);
  switch (curve) {
    case 'ease-in':
      return x * x;
    case 'ease-out':
      return 1 - (1 - x) * (1 - x);
    case 'ease-in-out':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'smootherstep':
      return x * x * x * (x * (x * 6 - 15) + 10);
    case 'linear':
    default:
      return x;
  }
}

/** Zod-friendly UI options for an easing `select` param hint. */
export const EASING_UI_OPTIONS = [
  { value: 'ease-in-out', label: 'Ease in-out' },
  { value: 'smootherstep', label: 'Smootherstep' },
  { value: 'ease-out', label: 'Ease out' },
  { value: 'ease-in', label: 'Ease in' },
  { value: 'linear', label: 'Linear' },
] as const;
