# Validate plugin UI-hint bounds at registration

Labels: `good first issue`, `plugins`, `validation`, `tests`

## Why

The registry checks that a UI hint names a real schema field, but it does not yet reject contradictory bounds or unusable choices. A malformed hint can reach the inspector even when the Zod parameter schema itself is valid.

## Scope

Extend `assertPluginContract` in `src/plugins/registry.ts` with small, deterministic UI-hint checks:

- range controls require finite `min`, `max`, and `step`, `min <= max`, and `step > 0`;
- number controls reject non-finite bounds or steps, reversed bounds, and non-positive steps when those values are supplied;
- select controls require at least one option and unique, non-empty option values;
- labels must contain non-whitespace text.

Error messages should name both the plugin ID and parameter field. Do not attempt to infer arbitrary Zod constraints or change runtime parameter parsing.

## Acceptance criteria

- Each invalid category above has a focused registry test.
- Existing built-in and legacy plugins register without changes in behavior.
- One valid fixture for every control type is accepted.
- Validation order and error messages are stable enough for contributors to diagnose the bad field.
- `pnpm verify` passes.

## Useful references

- `src/plugins/registry.ts`
- `src/plugins/registry.test.ts`
- `src/plugins/types.ts`
