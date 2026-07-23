# Known gaps

Status: `v0.1.0-alpha.0` private QA cut, 2026-07-23.

This document records observed limitations and deferred work; it is not a
promise that every item will ship. A green `pnpm verify` is the merge gate, but
it does not replace the browser, device, security, and release checks called
out below.

The workspace UX overhaul (see the "Unreleased" CHANGELOG entry) reworked the
editor shell — collapsible chat, on-demand media drawer, fullscreen player,
redesigned render bar, a design-token scale, and a legibility/contrast pass. It
was a layout, legibility, and interaction-quality change only; it did not resolve
any of the release-blocker, QA, or product gaps recorded below, so none have been
removed. Notably, media already survived a page refresh via IndexedDB before this
work (`directorPersistence.ts`); the overhaul added an explicit reload-survival
test and honest drawer copy rather than a persistence fix.

Difficulty estimates are intentionally coarse:

- **Low:** a localized change and focused tests, usually less than one day.
- **Medium:** several modules or a small compatibility matrix, usually one to
  three days.
- **High:** cross-cutting architecture, browser integration, or several days
  of validation.
- **Very high:** a new editing or rendering subsystem, likely measured in
  weeks.

## Public-release blockers

### Private vulnerability intake is not configured

`SECURITY.md:16-18` still contains the explicit private-contact placeholder.
Before public visibility, the owner must add a monitored private address or
enable GitHub private vulnerability reporting.

**Difficulty: Low** — this is an owner/configuration decision plus one
documentation edit.

### The README hero is still a placeholder

`README.md:5` calls for `docs/images/director-open-hero.png`, but no publication
screenshot is present. The placeholder is acceptable for private QA, not for
the intended public landing page.

**Difficulty: Low** — capture, review for private media or keys, optimize, and
commit one screenshot.

### The current tree is legacy-name clean, but the initial commit is not

The working tree scan has no legacy product-name matches. The repository's sole
committed extraction snapshot still contains four legacy-name strings: two
excluded-file references, one removed-logo filename, and one retired enum
value. That fails the previously stated whole-history publication standard.
History rewriting is deliberately not performed by this QA documentation pass.

**Difficulty: Low technically, Medium operationally** — amend/recreate the
single private commit only with explicit owner authorization, then repeat the
tree, history, and secret scans before any push.

## QA and compatibility gaps

### There is no real-browser end-to-end render test

The 42 current test files use Vitest/jsdom, synthetic frames, mocked fetch, and
the MCP SDK's in-memory transport. `ffmpegRenderer.test.ts` exercises planning,
cancellation, cleanup, and error handling with an FFmpeg harness; it does not
download the pinned core, encode a reel in a browser, download the MP4, and
verify that artifact end to end. No Playwright or Cypress configuration exists.

**Difficulty: High** — add deterministic local media, cache or serve a
license-reviewed test core, run a browser encode, inspect the download, and
make the job reliable in CI.

### Browser and device coverage is not yet a release matrix

The current gate does not exercise Chrome, Firefox, and Safari/WebKit across
representative desktop hardware. IndexedDB quotas, cross-origin isolation,
WebAssembly memory pressure, provider streaming, downloads, and FFmpeg Worker
behavior vary by browser and device; `docs/LOCAL_RENDERING.md:76`
already records a Chromium/multi-thread stall found outside the unit suite.

**Difficulty: High** — define supported versions, automate what can be
automated, and complete manual low-memory and long-render passes.

### Mobile editing is not qualified

The current interface and smoke plan target desktop Chrome and Safari. There is
no small-viewport/touch interaction suite, mobile memory budget, or supported
iOS/Android browser matrix, so loading the app on a phone is not a promise that
timeline editing or FFmpeg export will be usable.

**Difficulty: High** — audit every dense editor surface for touch and narrow
viewports, define reduced render limits, and validate current mobile browsers
and devices.

### Export verification is structural, not decode-level conformance

`src/lib/verify/mp4Parser.ts:15-17` intentionally never decodes media payloads.
It can validate bounded container metadata, codecs, timing, dimensions, tracks,
and sample counts, but it cannot prove that every sample decodes, that audio is
audible, or that the visible output is correct. Its fixtures are hand-built
synthetic boxes rather than a reviewed corpus of real encoder outputs.

**Difficulty: Medium** for a small licensed real-file corpus; **High** for
client-side decode sampling or deeper conformance without adding a large
runtime.

### The main application chunk is above Vite's advisory threshold

The production output present during this audit contains a 592,335-byte
minified main JavaScript chunk, and `vite.config.ts` has no explicit chunking
strategy. The FFmpeg wrapper is lazy, but the editor/plugin surface still
produces the existing `>500 kB` build advisory recorded in
`EXTRACTION_REPORT.md:139`.

**Difficulty: Medium** — profile module weight, split editor routes or heavy
effect code, and add a repeatable size budget without changing behavior.

## Product and data-portability gaps

### Portable project JSON does not contain media

Browser refresh recovery is durable for the active project because
`directorPersistence.ts` stores image and audio blobs in IndexedDB. Portable
project JSON intentionally stores `local-media:` references, sets
`localMediaOmitted`, and fixes `DirectorProjectReelSchema.audio` to `null`.
Import can reconnect same-browser media by stable IDs, but a file moved to
another browser or machine requires every image and audio file to be added
again. The MCP render plan is consequently symbolic rather than a portable
render bundle.

**Difficulty: High** — design an optional local archive or File System Access
workflow with size limits, migration, privacy review, and browser fallbacks.

### Persistence is one active media-bearing project plus bounded summaries

IndexedDB uses one `active` record. Up to eight history entries are stored as
schema-validated project summaries in localStorage and intentionally omit
unavailable media. There is no multi-project media library, storage-usage
dashboard, selective media eviction, or archive manager.

**Difficulty: High** — this needs a versioned multi-record store, quota-aware
UX, migrations, and deletion tests.

### Editing has no undo/redo transaction history

Actions are validated and applied transactionally, and history snapshots can
restore earlier project summaries, but there is no bounded command-level
undo/redo stack for manual or AI-applied changes.

**Difficulty: Medium** — define reversible commands around the shared action
boundary and cover media lifecycle, selection, and compound edits.

### The editor is still-image-and-music focused

The current reel schema supports still clips and one optional audio track. Each
clip now carries a full text-layer system — multiple positioned, styled, timed
layers with bundled fonts, scrim/outline/shadow, fades, and WYSIWYG preview↔export
parity — so the earlier single-plain-caption limitation is closed. Per-pixel transitions now share one blend function and boundary compositor across
preview and export (see the "Transition engine" decision), so the transition blend
is parity-exact on identical boundary frames; the residual difference is the
JS-vs-FFmpeg grade of the clip body around the transition, not the transition
itself. It still does not provide video clip trim/speed, waveform or beat analysis,
audio volume/fades, non-text multilayer composition, keyframes, masks, true HDR
mastering, or a real-browser end-to-end render test that confirms transition parity
visually (unverifiable under the no-dev-server QA constraint). “HDR look” is
deliberately an SDR grade.

**Difficulty: Very high** — these are multiple independent media/editor
subsystems and should be scheduled separately.

## Rendering and offline gaps

### First render depends on a runtime CDN download

`ffmpegRenderer.ts` downloads the pinned single-thread `@ffmpeg/core` 0.12.10
JavaScript and WebAssembly from jsDelivr on demand. There is no project-managed
offline cache or self-hosted reduced core, so a first render cannot start
offline and is exposed to CDN availability and policy controls. No user media
is sent with that request.

**Difficulty: High** — choose a delivery/cache design, keep assets within
hosting limits, and complete the GPL notice and corresponding-source workflow.

### High-resolution rendering is single-threaded and memory-sensitive

The multi-thread core is intentionally disabled after observed Worker stalls.
Structural effects can prepare many PNG frames in memory, and browser hardware
hints are advisory rather than guarantees. Long, 1080p, texture-heavy renders
therefore remain slow or may exceed WebAssembly/browser limits on constrained
devices.

**Difficulty: Very high** — a reliable watchdog-backed multi-thread mode or
WebCodecs path needs feature parity, fallback behavior, and a cross-browser
performance suite.

## AI and plugin gaps

### BYOK credentials are masked, not encrypted

`src/lib/ai/vault.ts` stores provider settings as plain JSON in one namespaced
localStorage entry. Masking prevents accidental display, but any script running
with the same origin privileges, a successful XSS, or a sufficiently privileged
browser extension can read the values. The existing static CSP and dependency
hygiene are therefore part of the credential boundary.

**Difficulty: High** — a meaningfully stronger durable vault needs an explicit
threat model and user-secret, OS-keychain, or session-only design; cosmetic
WebCrypto wrapping alone would not stop same-origin script access.

### Browser-direct providers depend on CORS and provider policy

OpenAI, Anthropic, Gemini, and custom/local adapters intentionally call the
selected endpoint from the browser. A custom Ollama, LM Studio, or vLLM server
must permit the app origin, and provider browser-access or retention policies
can change independently. A Worker proxy is not an acceptable fallback because
it would violate the BYOK architecture.

**Difficulty: Low** for clearer connection diagnostics and compatibility docs;
provider-side CORS support remains external.

### Most built-in recipes still use the deprecated compatibility adapter

Only `halftone-reveal` and `push-in` are standalone reference plugins. The
remaining grades, visual effects, motions, and transitions are registered by
`src/plugins/legacyAdapter.ts` with stable IDs and parity tests. Behavior is
preserved, but the full catalog does not yet demonstrate the public contract
module by module.

**Difficulty: High** — migrate recipes incrementally with stable IDs,
golden-frame/filtergraph parity, persistence compatibility, and no visual
changes.

### Plugin discovery is build-time and plugins are trusted code

Vite eagerly discovers committed `*.plugin.ts` modules through
`import.meta.glob`. Director Open does not install third-party plugins at
runtime, sandbox plugin code, or load plugins from URLs. This is a deliberate
contributor API, not an end-user extension marketplace.

**Difficulty: Very high** — runtime loading would require a capability model,
sandboxing, signatures/versioning, migration policy, and a safe render bridge.

### Plugin UI-hint validation is incomplete

The registry verifies that UI-hint fields exist in the Zod schema, but does not
yet reject reversed/non-finite numeric bounds, non-positive steps, empty
selects, duplicate values, or blank labels. This is already scoped in
`docs/good-first-issues/03-validate-plugin-ui-hints.md`.

**Difficulty: Low** — add deterministic contract checks and focused registry
tests.

## MCP gaps

### Concurrent file writers have no revision or lock protocol

`apply_actions` rereads the file, applies actions in memory, and atomically
renames the update, which protects against partial writes. It does not compare
an expected project revision, lock the file, or merge concurrent external
edits. Two agents or an agent plus a text editor can therefore race, with the
last completed rename winning. `get_project_state` also reflects the last
loaded snapshot until the client reloads or this server applies a change.

**Difficulty: Medium** — add an explicit revision/hash precondition and
conflict receipt; cross-platform advisory locking can remain optional.

### MCP distribution is not published yet

The package builds a `director-mcp` executable locally, while its README
correctly labels the `npx director-mcp` command as available only after npm
publication. The private QA cut must use `node packages/director-mcp/dist/cli.js`.

**Difficulty: Low** — owner-controlled package-name verification, provenance,
release metadata, and manual publication after the repository is ready.

## Deliberate v1 boundaries

These are safety and scope decisions, not defects:

- AI proposals never auto-apply; every browser edit has an Apply/Discard gate.
- The Worker serves static assets and rejects application API routes.
- User media is never sent to the Worker or an AI provider.
- MCP v1 is stdio-only, root-confined, action-capped, and performs no network,
  shell, subprocess, FFmpeg, or media-byte work.
- Export-verification failures inform but never suppress the user's MP4
  download.
- The Conductor phase remains future work rather than an agent loop hidden
  inside this alpha.
