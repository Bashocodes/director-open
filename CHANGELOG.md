# Changelog

This changelog describes product phases rather than individual commits. Dates
use ISO 8601.

## [Unreleased]

### Text / caption layer system

Replaced the single plain caption string with a professional text-layer system.
No render-pipeline architecture, MCP transport, or local-first boundary changed.

- Each clip now carries an array of text layers: multi-line content, normalized
  0..1 position, anchor, wrap width, rotation, rich style (bundled font, size
  preset or custom px-at-1080, weight, italic, color, letter-spacing, line-height,
  align, upper-case, scrim pill, outline, shadow), and timing (in/out + fades).
- Project schema bumped v1 → v2 with a version-gated, idempotent migration that
  converts the legacy caption into one bottom-centered text layer.
- One pure render module (`src/lib/text/renderTextLayer.ts`) is the single source
  of truth: the live preview overlay and the FFmpeg export path both draw through
  it, so what the preview shows is what the MP4 contains. Export composites each
  layer as a full-frame PNG with FFmpeg `overlay …:enable` windows and a matched
  linear `fade=alpha` envelope.
- Bundled five open-licensed (SIL OFL) fonts as local Latin-subset woff2 assets —
  Inter, Space Grotesk, Playfair Display, Bebas Neue, JetBrains Mono — loaded via
  @font-face, never a CDN, and preloaded before measurement/render.
- Direct manipulation on the preview: click-select, drag with centre/thirds/
  title-safe snap guides, arrow-key nudge, double-click inline edit, Delete (with
  confirm), Escape to deselect; z-order via the inspector.
- New "Text" inspector section (layers list, add, per-layer style/timing controls,
  legibility-on-busy-footage preset) grouped with the D1 collapsible sections.
- Extended the Director action schema with `add_text_layer`, `update_text_layer`,
  `move_text_layer`, and `remove_text_layer` (same strict-flat convention and
  human-Apply gate); the canvas-context serializer and MCP `describe_schema`
  surface text layers.

### Workspace UX overhaul

Layout, legibility, and interaction-quality pass over the editor shell. No render
pipeline, schema, MCP, or AI-provider behavior changed; the local-first boundary
is untouched.

- Added a single design-token module (`designTokens.ts`) — type scale, spacing,
  radii, and an ordered z-index scale — injected as CSS custom properties and
  applied across the stylesheets. Removed all sub-11px text and raised dim
  label colors to meet WCAG AA contrast on the dark theme.
- Introduced a dedicated workspace-layout state module (`workspaceLayout.ts`)
  with a reducer and its own `director-open.workspace.v1` localStorage key, so UI
  chrome never enters the project schema.
- Made the Director chat panel collapsible to a slim rail (icon, unread dot,
  expand affordance) via the rail, a header button, and Cmd/Ctrl+\; the state
  persists and the canvas/timeline reclaim the freed width.
- Replaced the permanent left "Local Library" dock with an on-demand media
  drawer (slide-over from the left; Escape/outside-click/X to close) backed by a
  small `LibrarySource` seam for future providers.
- Added a fullscreen reel player (Fullscreen API, Esc to exit, controls fade
  after 2s idle, double-click toggle), plus Space play/pause, arrow-key scrub
  (Shift = frame-precise), and a fit/fill toggle.
- Rebuilt the render bar into one coherent action bar: a legible format chip on
  the left, the primary "Render on this device" CTA on the right, and engine
  details moved into an info popover.
- Grouped the clip inspector into collapsible sections with sticky mini-headers
  and remembered open/closed state; the selected clip name truncates with the
  full name on hover.
- Redesigned the first-run canvas, empty drawer, and empty timeline states to be
  calm and instructional (two lines + one action each).
- Fixed floating-overlay stacking: every absolute/fixed surface now draws from
  the shared z-index scale, and the settings/history popovers are height-capped
  so their controls no longer overlap the chat composer.

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
