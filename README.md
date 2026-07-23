# Director Open

Director Open is a local-first visual direction, storytelling, and reel studio. Upload visual references from your device, choose what to inherit from each source, compile a Direction Contract, expand it into a coherent story, and edit and render the result as an MP4 in the browser.

The app combines a React 18 + Vite interface, a Cloudflare Worker for structured director turns, schema-validated canvas and reel actions, browser-local project recovery, and FFmpeg.wasm rendering.

## What the user creates

1. Upload local visual references to the canvas.
2. Choose inheritance channels: emotion, material, world, framing, palette, identity, silhouette, or lighting.
3. Compile sources, locks, exclusions, and conflict resolutions into a Direction Contract.
4. Turn the approved contract into a three-to-eight-beat visual story.
5. Inspect continuity drift and apply bounded revisions.
6. Open Reel Studio and edit clips manually or through chat.
7. Apply color grades, structural effects, transitions, camera motion, timing, captions, format, and render quality.
8. Add local music and render an H.264 MP4 locally with FFmpeg.wasm.

The local library intentionally starts empty. There is no bundled corpus, gallery search, remote asset provider, or image proxy. Local images, audio, and rendered video bytes stay in the browser and are never sent to the Worker or model providers.

## Reel engine

Preview and export share the same bounded timeline compiler, caption layout, structural-effect recipes, transition overlap rules, and normalized project state. FFmpeg.wasm loads only after the user confirms a render.

The editor supports up to 16 still-image clips, 24/30 fps, 9:16, 1:1, and 16:9 output, local music, ten color grades, seven structural visual effects, seven transitions, ten camera moves, and draft through maximum quality modes. See [the local rendering architecture](./docs/DIRECTOR_V2_LOCAL_RENDERING.md) and [third-party notices](./THIRD_PARTY_NOTICES.md).

## Models

The Worker supports OpenAI Responses with GPT-5.4 or GPT-5.4 mini and an optional Gemini 3.5 Flash path. Provider credentials are optional server-side Worker secrets and never enter browser code, committed files, or local project history.

When the selected provider is not configured, the credential-free deterministic mode returns schema-valid direction, story, continuity, and reel actions. It is clearly labeled as a fallback rather than live model output.

## Local setup

Requirements: Node.js 22.12.0 or newer and pnpm 11.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173/director/`. No environment file or provider credential is required for deterministic local operation.

Optional provider secrets may be supplied through an uncommitted `.dev.vars` file:

```text
OPENAI_API_KEY=
GEMINI_API_KEY=
```

## Verification

```bash
pnpm verify
```

This runs TypeScript checks for the browser and Worker, the Vitest suite, and the production Vite build.

## Privacy

Canvas metadata and recovery snapshots are stored in browser-local storage. Imported local media, `File` objects, object URLs, and rendered downloads are intentionally ephemeral and must be re-added after refresh. OpenAI requests use `store: false`.

See [PRIVACY.md](./PRIVACY.md) for the complete data boundary and [docs/OPENAI_IMPLEMENTATION.md](./docs/OPENAI_IMPLEMENTATION.md) for the structured model integration.
