# Add a `page-peel` per-pixel transition plugin

Labels: `good first issue`, `plugins`, `transitions`

## Why

The per-pixel transition tier (see the [Transition engine](../DECISIONS.md) decision and the
`ripple-dissolve` walkthrough in [PLUGINS.md](../../PLUGINS.md)) makes it easy to add a new
cinematic transition without touching any core file. A page-peel — where frame A lifts from a
configurable corner like a turning page, revealing B underneath with a soft shadow along the
curl — is a natural, self-contained addition that exercises the whole pattern.

## Scope

Add `src/plugins/transitions/page-peel.plugin.ts` (auto-discovered — no core edits):

- Typed Zod params including `duration`, `easing` (default a non-linear curve), the peel
  `corner` (a `select`), and `curl`/`shadow` amounts. Express every spatial quantity as a
  fraction of the frame so 540-wide preview and 1080-wide export match.
- A pure `renderFrame({ frameA, frameB, progress, width, height, params })` that displaces the
  A sample coordinates along the peel diagonal (a first-principles cylindrical-curl
  approximation), darkens a band near the curl for the shadow, and reveals B behind it.
  It MUST return exactly `frameA` at progress 0 and `frameB` at progress 1.
- Keep affine `preview`/`ffmpegTransition` fallbacks so the registry contract is satisfied.

## Acceptance criteria

- The transition appears automatically in the registry-driven picker with a live thumbnail.
- A golden-fingerprint + parity test (0.25/0.5/0.75 on synthetic frames, plus the exact-A@0 /
  exact-B@1 assertion) following `transitions.golden.test.ts`.
- No ported shader/library code; math is original and documented inline.
- `pnpm verify` passes.

## Useful references

- `src/plugins/transitions/ripple-dissolve.plugin.ts`
- `src/plugins/transitions/transitionKit.ts`
- `src/plugins/transitions/transitions.golden.test.ts`
