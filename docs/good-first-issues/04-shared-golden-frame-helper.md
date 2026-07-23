# Share the deterministic golden-frame test helper

Labels: `good first issue`, `plugins`, `tests`, `refactor`

## Why

The reference-plugin and structural-effect suites independently build the same synthetic RGBA frame and FNV-1a pixel fingerprint. A shared test-only helper will make the recommended plugin testing recipe easier to reuse without changing render code.

## Scope

Create a test helper under `src/test/` that exports:

- the existing deterministic `96 × 128` RGBA fixture-frame builder; and
- the existing byte fingerprint function that reports both the FNV-1a hash and changed-pixel count.

Update `src/plugins/builtin/referencePlugins.golden.test.ts` and `src/pages/director/reel/structuralEffects.golden.test.ts` to use it. Keep the JSON/text fingerprint local to the reference-plugin test because it serves a different purpose.

## Acceptance criteria

- Both suites import one shared frame builder and byte fingerprint implementation.
- Every reviewed golden string remains unchanged.
- Tests continue to prove that an effect does not mutate its source frame.
- The helper has no production import and performs no DOM, network, clock, or random work.
- `PLUGINS.md` points plugin authors to the shared helper in its golden-frame testing recipe.
- `pnpm verify` passes.

## Useful references

- `src/plugins/builtin/referencePlugins.golden.test.ts`
- `src/pages/director/reel/structuralEffects.golden.test.ts`
- `src/test/setup.ts`
- `PLUGINS.md`
