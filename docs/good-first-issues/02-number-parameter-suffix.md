# Support suffixes on number parameter controls

Labels: `good first issue`, `plugins`, `ui`, `tests`

## Why

Range hints can display units through `suffix`, but number hints cannot. Transition duration therefore appears as a bare number even though plugin authors may want to communicate units such as seconds, degrees, or pixels.

## Scope

Add optional `suffix?: string` support to `NumberParamHint` and render it beside the number input in `PluginParamFields`. Keep the suffix presentational: the value passed to `onChange` must remain a bounded number.

Use the existing UI language and layout; this task does not call for a broader inspector redesign.

## Acceptance criteria

- `NumberParamHint` accepts an optional suffix without weakening the types of other hints.
- A number control with `suffix: 's'` visibly and accessibly communicates seconds.
- Editing the field still calls `onChange(field, number)` and honors its minimum and maximum.
- Number controls without a suffix render exactly as before.
- `PluginParamFields.test.tsx` covers suffixed and unsuffixed controls.
- The parameter-hint table in `PLUGINS.md` documents the option.
- `pnpm verify` passes.

## Useful references

- `src/plugins/types.ts`
- `src/pages/director/reel/PluginParamFields.tsx`
- `src/pages/director/reel/PluginParamFields.test.tsx`
- `PLUGINS.md`
