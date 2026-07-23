# Decision log

## Standalone local library

The open-source project has no external gallery or asset-service dependency. Its library starts empty and accepts user-selected JPEG, PNG, and WebP files. Local media remains inside the browser: imported blobs persist in IndexedDB for refresh recovery, while portable project JSON and model context exclude their bytes, filenames, and runtime object URLs.

## Structured action boundary

Model output is parsed with the shared Zod schema. Canvas and reel mutations resolve only against current object and clip identifiers, and the browser replaces proposals with sanitized applied-action receipts. Unsupported, stale, duplicate, or no-op actions cannot be represented as completed changes.

## Browser-local rendering

Preview remains interactive without loading FFmpeg. Final rendering begins only after explicit confirmation, runs through the pinned single-thread FFmpeg.wasm core, and produces a local H.264 MP4. All temporary files, Workers, and generated core URLs are cleaned up after each attempt.

## Browser-local recovery

Canvas metadata, conversation, creative artifacts, reel settings, and imported image/audio bytes for the active project are persisted locally in IndexedDB. Eight bounded history summaries remain schema-validated in local storage. Temporary blob URLs and rendered output are never persisted.

## Text layers and preview↔export parity

On-screen text is modeled as an ordered array of text layers per clip (see
`TextLayerSchema`), not a single caption string. A pure module,
`src/lib/text/renderTextLayer.ts`, is the single source of truth: both the live
preview overlay and the FFmpeg export path draw each layer through it, so the
preview is WYSIWYG for the rendered MP4.

**Parity mechanism.** For export, each text layer is rasterized once by
`renderTextLayer` to a full-frame transparent PNG at output resolution (position
baked in via normalized coordinates × target pixels, glyph size scaled from a
1080-wide reference). FFmpeg composites it with `overlay=0:0:enable='between(t,in,out)'`
and applies the timing envelope with `fade=in/out:…:alpha=1`. This was chosen over
per-frame sequences because it guarantees the *steady-state glyph raster is
byte-identical* to the preview (same module, same PNG) while keeping memory bounded
(the renderer already fights ffmpeg.wasm address-space limits). Parity is claimed
for the glyph raster and a *matched linear alpha envelope* for fades — not
bit-exact fade midpoints, since canvas source-over blends in sRGB and FFmpeg blends
post-YUV. Layers are capped at 8 per clip to bound the number of full-frame RGBA
inputs held in memory.

**Golden tests are op-stream, not PNG.** The test environment (jsdom/node) has no
canvas text rasterizer, so pixel-PNG goldens cannot run and would be
freetype-version-flaky across machines. `renderTextLayer` therefore takes an
injected 2D context; tests pass a recording fake and golden-compare the ordered
draw-op stream (font, align, fill/stroke, alpha, shadow, transform, coordinates),
which deterministically captures everything that determines the pixels. The
browser passes the real `CanvasRenderingContext2D`.

**Fonts.** Five open-licensed (SIL OFL 1.1) fonts are bundled as Latin-subset
woff2 under `public/fonts` (~228 KB total, subset with `pyftsubset`; the tooling is
not a project dependency — the committed woff2 files are the deliverable). They
load via @font-face from the same origin, never a CDN, honoring the local-first
rule, and are preloaded (`ensureTextFontsReady`) before any measurement or render.

**Chat/MCP surface.** Text actions extend the existing strict-flat
`DirectorReelActionSchema` (Option A) rather than a new union member, since text
lives on clips and every reel edit already funnels through one action object plus
`applyDirectorReelActions`. The action exposes a practical flat subset
(`content`, `textX/textY`, `sizePreset`, `fontId`, `textColor`, `align`, `inSec/outSec`);
full styling stays in direct manipulation and the inspector.

## Workspace layout model

The editor shell is organized into intentional zones — a center canvas/preview, a
bottom timeline, a right-hand chat panel, and transient surfaces (media drawer,
settings and history popovers, render-details popover). Zone sizing and the
stacking order are defined in one place: `designTokens.ts` (spacing, radii, a
type scale with an 11px floor, and an ordered z-index scale) plus
`workspaceLayout.ts` (a reducer that models chat collapse, drawer visibility,
inspector-section open/closed state, and preview fit).

Workspace layout is UI chrome, deliberately kept out of the Zod-validated,
privacy-bounded, portable project schema. Its persisted subset lives in a
separate `director-open.workspace.v1` localStorage key, so nothing here can leak
into exported project JSON or the text context sent to an AI provider. Runtime-only
flags (drawer open, chat unread) always start fresh on load.

## Local library seam

The media drawer reads from a `LibrarySource` interface (`librarySource.ts`)
rather than reaching into canvas state directly. The only shipped implementation,
`createLocalLibrarySource`, surfaces the browser-local media the active project
already holds (uploaded canvas references and the reel audio) and routes add/remove
back through the existing upload and removal handlers. The interface — `list()`,
`add(files)`, `remove(item)` — is the single seam a future provider (for example
an MCP-backed remote library) would implement. Only the local implementation
ships; no remote provider, network access, or media egress is introduced.

## Neutral deployment

The Cloudflare Worker is configured only for its own `workers.dev` deployment by default. It contains no zone route, account identifier, private service binding, or external asset origin.
