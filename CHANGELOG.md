# Changelog

This changelog describes product phases rather than individual commits. Dates
use ISO 8601.

## [0.1.0-alpha.0] - 2026-07-23

Private QA cut. No production deployment, package publication, or repository
visibility change is part of this release.

### Extraction

- Created Director Open as a standalone repository with fresh history and a
  neutral package, application, Worker, and documentation identity.
- Removed inherited service bindings, remote corpus/search/demo-media paths,
  branded assets, and compliance material that did not belong in the
  open-source successor.
- Preserved the reel engine, typed director-action schemas, persistence behavior,
  and unrelated regression tests while establishing the clean baseline.

### Isolated deployment lane

- Assigned the Worker the independent `director-open` name with workers.dev
  enabled and no routes, zones, or custom domains.
- Kept the Vite static asset build behind the Worker while rejecting all
  application API routes.
- Moved local development to fixed ports `5190` for Vite and `8790` for
  Wrangler so the projects can run side by side.
- Added deployment and rollback guidance, including the explicit prohibition
  on adding legacy product routes from this repository.

### Local-first media

- Made user uploads and locally generated frames the only media sources;
  removed remote media fetching, proxying, demo assets, and bundled photos.
- Persisted the active project and imported image/audio blobs in IndexedDB,
  with quota-aware user feedback and bounded browser-local history summaries.
- Audited object-URL ownership and FFmpeg cleanup across replacement, removal,
  unmount, cancellation, failure, and successful export.
- Added the persistent “100% local” privacy indicator and documented the
  static-only Worker, browser storage, AI text boundary, and absence of
  analytics.

### Browser-direct BYOK AI

- Added streaming provider adapters for OpenAI, Anthropic, Google Gemini, and
  OpenAI-compatible custom/local endpoints.
- Added one namespaced browser settings vault with editable models, masked
  credentials, per-provider removal, and a no-key setup state that leaves the
  rest of the editor usable.
- Removed the Worker AI proxy and server-held provider-key binding; credentials
  are sent in request headers only to the provider the user selected.
- Reused a bounded canvas serializer to give chat current project context
  without media bytes, filenames, files, object URLs, frames, or exports.
- Parsed and Zod-validated proposed director actions, rendered human-readable
  Apply/Discard previews, and routed approved changes through the same
  transactional action path as editor-originated changes.

### Typed plugins

- Introduced typed contracts for effects, transitions, and motion presets,
  including Zod defaults, generated-control hints, deterministic preview hooks,
  and FFmpeg/filtergraph hooks.
- Added collision-safe, stably ordered registry lookup and eager discovery of
  self-contained `*.plugin.ts` contribution modules.
- Moved `halftone-reveal` and `push-in` into reference plugins while preserving
  every existing stable ID through a deprecated legacy adapter.
- Added schema-driven parameter controls, persistence integration,
  deterministic performance rules, and golden-frame/filtergraph parity tests.

### Export verification

- Added a dependency-free, truncation-safe ISO-BMFF parser with finite depth,
  box, issue, track, and brand limits.
- Extracted brands, movie/media timing, track types, video codec/configuration,
  dimensions, sample counts, audio codec, and sample rate where present.
- Added expectation-based `ok`/`warn`/`fail` report entries and an overall
  verdict for duration, resolution, video presence, frames, codec, and file
  size.
- Ran verification automatically after local export and added an expandable
  result panel plus JSON report download; a failed check never blocks the MP4.
- Added synthetic valid and malformed fixtures covering truncation, absurd
  sizes, deep nesting, zero tracks, and bounded-memory behavior.

### Open-source readiness

- Added the MIT license for KALAI LABS, regenerated third-party notices from
  the installed dependency tree, and documented the separate GPL
  `@ffmpeg/core`/libx264 runtime boundary.
- Rewrote the project overview around local-first media, browser-direct AI,
  typed actions, plugins, verified export, static deployment, and headless MCP.
- Added contribution, conduct, security, deployment, privacy, plugin, and
  FFmpeg licensing guides plus issue and pull-request templates.
- Added four bounded good-first-issue specifications for plugin and test
  contributions.
- Added Node 22/pnpm CI with the complete verification gate and a pinned,
  checksum-verified gitleaks history scan.

### Headless MCP

- Added the `packages/director-mcp` workspace package using the official MCP SDK
  and stdio transport.
- Exposed seven tools: `describe_schema`, `load_project`, `get_project_state`,
  `validate_actions`, `apply_actions`, `compile_timeline`, and
  `build_render_plan`.
- Imported the app's canonical project schema, action engine, canvas
  serializer, timeline compiler, and FFmpeg command planner instead of forking
  those contracts.
- Confined file access to a required realpath-resolved `--root`, rejected
  escapes and unsafe files, capped project/action inputs, returned structured
  errors and receipts, and used atomic sibling-file replacement.
- Documented local build/run, future `npx` use, Claude Code and Codex CLI
  configuration, an example editing transcript, and the stdio-only safety
  boundary.

### QA cut

- Aligned the root and MCP package versions at `0.1.0-alpha.0`.
- Unified typechecking, Vitest suites, and production builds under
  `pnpm verify`, including the browser application, static Worker, shared
  engines, and MCP package.
- Completed the private-cut verification gate with 203 passing application
  tests and 8 passing MCP tests, followed by successful production builds.
- Reconciled the local-rendering guide and runtime wording with the implemented
  local-media boundary, IndexedDB recovery model, and export verifier.
- Expanded focused coverage for local-media boundaries, IndexedDB blob
  round-trips, provider request shaping and vault behavior, action parsing and
  stale targets, plugin registry/goldens, malformed MP4 safety, and MCP
  root/action limits.
- Added `GAPS.md` as the honest release-risk, deferred-work, and deliberate-v1
  boundary ledger for QA sign-off.
