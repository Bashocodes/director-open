# Add a `clock-wipe` per-pixel transition plugin

Labels: `good first issue`, `plugins`, `transitions`

## Why

A clock-wipe (radial sweep) reveals frame B in an expanding angular wedge around a center,
like a clock hand sweeping the frame. It is a classic transition and a small, well-scoped way
to practice the per-pixel transition pattern (see the `ripple-dissolve` walkthrough in
[PLUGINS.md](../../PLUGINS.md)).

## Scope

Add `src/plugins/transitions/clock-wipe.plugin.ts` (auto-discovered — no core edits):

- Typed Zod params: `duration`, `easing` (non-linear default), `centerX`/`centerY` (0..1),
  `startAngle` (degrees), `direction` (`clockwise`/`counter-clockwise`, a `select`), and
  `softness`. Keep all spatial values normalized to the frame.
- A pure `renderFrame` that, per pixel, computes the angle from the center relative to
  `startAngle`, compares it to the swept angle (`progress * 2π`), and blends A→B with a soft
  edge of width `softness`. Return exactly `frameA` at progress 0 and `frameB` at progress 1.
- Affine `preview`/`ffmpegTransition` fallbacks to satisfy the registry contract.

## Acceptance criteria

- Appears automatically in the picker with a live thumbnail and Zod-generated controls.
- Golden-fingerprint + parity test at 0.25/0.5/0.75 on synthetic frames, plus exact-A@0 /
  exact-B@1, following `transitions.golden.test.ts`.
- Original first-principles angular math; no ported code.
- `pnpm verify` passes.

## Useful references

- `src/plugins/transitions/directional-wipe.plugin.ts` (a related projected-gradient wipe)
- `src/plugins/transitions/transitionKit.ts`
