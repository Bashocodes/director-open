# Director Open

> A local-first reel studio that humans and AI agents can both drive — your media never leaves the browser.

![The Director Open workspace: a reel preview on the left with an anamorphic-streak
effect applied, the plugin's generated parameter controls on the right, and the
timeline, undo controls and local render bar below.](docs/images/director-open-hero.jpg)

Director Open is a browser-based visual direction and reel editor. Bring your own images and audio, shape a structured story on the canvas, edit the reel manually or with an optional AI provider, and render and inspect the MP4 on your device.

## Features

- **Local-first media:** imported images, audio, generated frames, previews, project recovery, and MP4 rendering stay in the browser. Projects and media blobs persist in IndexedDB.
- **Bring-your-own-key AI:** optional browser-direct adapters support OpenAI, Anthropic, Google Gemini, and OpenAI-compatible custom or local servers such as Ollama, LM Studio, and vLLM. Keys stay in browser storage and are sent only to the selected provider.
- **Canvas-aware, human-gated edits:** chat receives a compact text serialization of the current project and proposes Zod-validated director actions. Nothing is applied until a person chooses **Apply**.
- **Headless MCP editing:** the stdio-only `director-mcp` package lets Claude Code, Codex CLI, and other MCP clients inspect project JSON, validate and apply the same typed actions transactionally, compile timelines, and inspect render plans without starting the browser.
- **Typed plugin API:** effects, transitions, and motion presets declare stable IDs, Zod parameter schemas, UI hints, preview hooks, and export hooks. Plugin controls and catalogs come from the registry. The library ships 14 transitions (7 cinematic per-pixel: ripple-dissolve, liquid-melt, directional-wipe, luma-wipe, whip-pan, dip-to, glitch-cut), 19 camera moves, 14 color grades, and 17 visual effects (film-grain, halation-bloom, vignette-breathe, anamorphic-streak, chromatic-aberration, tilt-shift, light-leak, neon-edge, halftone-print and more) — every one a registry plugin, selected through a searchable picker with live thumbnails.
- **Stills without a video render:** apply the same grades, effects, camera framing and text layers to a single frame and save it as PNG, JPEG or WebP at source resolution. It shares the player's composition code, so the export matches what you scrubbed to, and it never loads the video encoder — a still takes milliseconds, not minutes.
- **Professional text layers:** each clip carries multiple positioned, styled, timed text layers (bundled local fonts, scrim/outline/shadow, fades) with WYSIWYG preview↔export parity and direct on-canvas manipulation.
- **Browser-local reel engine:** FFmpeg.wasm compiles the timeline, grades, effects, motion, transitions, text, and optional audio into an H.264 MP4.
- **Built-in export verification:** a bounded TypeScript ISO-BMFF parser inspects the resulting bytes for duration, tracks, codecs, dimensions, frames, audio, and container integrity. Warnings never block the download.
- **No required backend:** the Cloudflare Worker serves the compiled SPA and security headers only. It has no media, AI, analytics, account, or persistence API.

## Quickstart

Requirements:

- Node.js 22.12 or newer
- pnpm 11

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5190/director/`. The local static Worker runs on port `8790`. No environment file, account, or AI key is required.

Run the complete quality gate before opening a pull request:

```bash
pnpm verify
```

That command type-checks the browser, Worker, and MCP package, runs the Vitest suite, and builds the production application and MCP executable.

## Architecture

```text
Browser
├── React + Vite SPA
├── IndexedDB ── project state + imported media blobs
├── Canvas/reel engine ── schema-validated human and AI actions
├── FFmpeg.wasm ── local render ── verified MP4 download
└── Optional text request ── directly to the selected AI provider

Cloudflare Worker
└── Compiled static assets + security headers only

Headless
└── stdio MCP server ── project JSON + the same action/apply/timeline/render-plan code
```

The Worker rejects `/api/*`; it never receives media, prompts, keys, projects, or rendered output. Provider-enabled chat calls leave the browser only as text sent directly to the provider the user selected. The FFmpeg core is executable application code downloaded on demand; no user media is sent with that request.

Deployment is deliberately isolated to the `director-open` workers.dev lane. See [DEPLOY.md](./DEPLOY.md).

## Privacy guarantee

Director Open has no media server, upload endpoint, analytics SDK, advertising tracker, user database, or telemetry pipeline. Images, audio, intermediate frames, and video bytes remain on the device. Temporary object URLs and FFmpeg files are released after replacement, removal, cancellation, failure, or completion.

The optional AI feature sends text-only conversation and a bounded text summary of project state directly to the chosen provider. It does not send media bytes, local filenames, `File` objects, object URLs, frames, or exports. Provider data-use terms still apply when AI is enabled.

See [PRIVACY.md](./PRIVACY.md) for the complete boundary.

## Text

Each reel clip supports an array of text layers instead of a single caption.
A layer has multi-line content, a normalized 0–1 position (so every resolution
renders identically), anchor, wrap width, rotation, a full style (font, size,
weight, italic, color, letter-spacing, line-height, alignment, upper-case, scrim
pill, outline, shadow), and timing (in/out plus fades).

Text is authored two ways: directly on the preview (click to select, drag with
centre/thirds/title-safe snap guides, arrow-key nudge, double-click to edit inline)
and through the right-panel **Text** inspector. A single pure module,
`src/lib/text/renderTextLayer.ts`, draws every layer for both the live preview and
the FFmpeg export, so the preview is what the MP4 contains.

Five open-licensed fonts (Inter, Space Grotesk, Playfair Display, Bebas Neue,
JetBrains Mono) are bundled as local Latin-subset `.woff2` assets and loaded via
`@font-face` from the same origin — never a CDN — preserving the local-first
guarantee. See [docs/DECISIONS.md](./docs/DECISIONS.md) for the parity mechanism and
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for the font licenses.

## Plugin authoring

New effects, transitions, and motion presets live in self-contained `.plugin.ts` modules and are discovered without editing core catalogs or UI components. Start with [PLUGINS.md](./PLUGINS.md), which documents the contract, reference plugins, determinism rules, parameter UI, and golden-frame tests.

## FFmpeg licensing

The bundled `@ffmpeg/ffmpeg` JavaScript wrapper is MIT-licensed. When a render starts, Director Open downloads `@ffmpeg/core` 0.12.10 from jsDelivr at:

```text
https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/
```

That runtime core is distributed as `GPL-2.0-or-later` and includes libx264; Director Open invokes `libx264` for H.264 export. This repository's MIT license does not relicense the FFmpeg core. Anyone redistributing, mirroring, modifying, or bundling that core must independently satisfy the applicable GPL obligations, including the relevant notices and corresponding-source requirements. This is a project notice, not legal advice.

An optional WebCodecs export path is planned so compatible browsers and downstream deployments can render common formats without loading the GPL FFmpeg core. FFmpeg remains the compatibility path until that alternative reaches feature and output parity.

Read [docs/FFMPEG_LICENSING.md](./docs/FFMPEG_LICENSING.md) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) before distributing a hosted or packaged build.

## Roadmap

- **MCP server — shipped:** [`packages/director-mcp`](./packages/director-mcp/README.md) exposes the validated director-action surface to local AI agents through a root-confined, file-based stdio workflow.
- **Conductor phase later:** coordinate longer human-approved creative workflows across canvas direction, reel construction, and export.

## Contributing

Contributions are welcome, especially focused plugin additions. Read [CONTRIBUTING.md](./CONTRIBUTING.md), follow the [Code of Conduct](./CODE_OF_CONDUCT.md), and run `pnpm verify` before submitting a pull request.

## License

Director Open is licensed under the [MIT License](./LICENSE), copyright © 2026 KALAI LABS.

The runtime FFmpeg core is separate GPL-licensed software; see the FFmpeg licensing section above.
