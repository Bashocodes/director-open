# Add a `slide-up` transition plugin

Labels: `good first issue`, `plugins`, `tests`

## Why

The transition contract is public, but every transition currently comes through the legacy adapter. A small native transition is a useful first contribution and another concrete example for plugin authors.

## Scope

Add `src/plugins/builtin/slide-up.plugin.ts` as a self-contained transition plugin. Use the existing `defineTransitionPlugin` helper, a stable `slide-up` ID, and a `duration` parameter with a sensible default and number-control UI hint. The preview should move the incoming frame upward from below, and export should return FFmpeg's `slideup` xfade name.

Do not edit a central catalog or registry list: the existing Vite glob must discover the plugin automatically.

## Acceptance criteria

- The plugin appears in `pluginRegistry.list('transition')` with a stable order and is not deprecated.
- `params.schema.parse({})` supplies the documented default duration.
- Preview output is deterministic and is asserted at progress `0`, `0.5`, and `1` for a fixed canvas size.
- The export hook returns `slideup`.
- A registry or focused plugin test proves automatic discovery and the preview/export behavior.
- `pnpm verify` passes.

## Useful references

- `src/plugins/types.ts`
- `src/plugins/builtin/push-in.plugin.ts`
- `src/plugins/legacyAdapter.ts`
- `src/pages/director/reel/ReelPreview.tsx`
- `PLUGINS.md`
