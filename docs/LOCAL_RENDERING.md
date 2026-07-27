# Browser-local reel editing and rendering

## Product contract

Director is both a visual planning system and a local editing system. A user can build a direction from locally uploaded references, create a story, ask the Visual Expert to turn those references into a reel, revise one, several, or all clips in natural language, inspect the applied changes in a timeline, and render locally through FFmpeg or hand the same timeline to a local Adobe After Effects bridge without sending media to a model endpoint or cloud-render service.

The agent plans and applies editing operations. The browser owns media and preview; the user chooses the free FFmpeg renderer or the optional local Adobe renderer.

## Architecture

1. **Direction board** — references, inheritance, Direction brief, story, and continuity remain the source of creative intent.
2. **Reel action protocol** — provider output is schema-validated into one of seven executable tools: open, add, remove, reorder, style, set project, or request render.
3. **Deterministic action engine** — proposed actions are resolved only against current object and clip IDs, normalized, and applied to the browser project. The response artifact is replaced with sanitized `appliedActions`, so stale, unsupported, duplicate, and no-op requests are not represented as completed work.
4. **Reel project** — the browser stores clip order, multi-selection, duration, color grade, visual effect, strength, transition, motion, caption, format, fps, quality, local media references, and music. Animate may open with no canvas references so local images can be added immediately.
5. **Shared timeline compiler** — preview, duration labels, and FFmpeg planning use the same starts and incoming overlaps. The first clip is always a cut; each later overlap is capped at two seconds and at half the duration of both adjacent clips.
6. **Live preview** — Canvas draws the active clips, virtual camera movement, transitions, captions, and structural effects at interactive speed. JavaScript structural effects call the same deterministic `renderFrame(sourceRgba, width, height, { phase, progress, seed, intensity })` plugins used to prepare an export.
7. **FFmpeg render** — FFmpeg.wasm runs inside its own Web Worker and receives media through an in-memory filesystem. The browser prepares deterministic structural-effect PNG sequences at half the output frame rate, FFmpeg duplicates them to the requested frame rate, then applies camera motion, CRT scan or motion echo, grades, composition, and encoding to produce an H.264/AAC MP4. In the local app, the verified Blob is immediately sent to the loopback-only output service and saved as a unique `~/Movies/Director/<reel>-<timestamp>-ffmpeg.mp4`; **Show output** reveals that exact file. Static builds keep the normal browser download fallback.
8. **Adobe render** — the optional After Effects backend prepares selected structural effects and camera motion as exact Director plates, writes its temporary handoff under `~/Library/Caches/Director/Adobe Handoffs`, then sends one deterministic ExtendScript transaction through the Adobe MCP. After Effects configures 32-bpc `Rec.2100 HLG Scene W100`, imports the prepared timeline, applies grades, transitions, text, and native Audio Amplitude beat markers, and queues the best installed known HLG ProRes profile. A verified delivery is moved directly into `~/Movies/Director`, and the temporary successful handoff is removed. It does not remove or replace FFmpeg.
9. **Cleanup and recovery** — temporary FFmpeg input, caption-overlay, and output files are deleted from the in-memory filesystem, while IndexedDB auto-saves the active project and imported media. Temporary object URLs and rendered downloads do not persist. Retired visual-effect IDs are normalized on load and the restored project carries a visible migration receipt rather than silently changing the edit.

No local image, audio, or rendered-video bytes, `File` objects, object URLs, or local filenames enter Director/model requests. Reel context contains bounded IDs and edit settings, including user-authored caption text. A local file's title is neutralized to `Local image N` before context is created.

## Selection and chat accountability

- Command/control/shift selection and **Select all** create an explicit multi-selection. Manual inspector changes apply to every selected clip.
- For validated chat actions, an empty clip-ID list targets the current valid selection, or every current clip when there is no selection. “All,” “every,” and “entire reel” are expanded to current clip IDs by the planner and still revalidated by the action engine.
- Explicit stale clip IDs do not fall back to all clips. Invented object IDs cannot add a reference, and unsupported catalog values fail schema validation.
- Removing or reordering clips normalizes selection and first-clip transition state.
- A render action only sets `renderRequested` and opens the local confirmation state. The model never renders or claims to have rendered the MP4.
- Manual edits clear a pending render request. The next chat turn is built from current normalized project state, so chat sees the latest manual settings without receiving media bytes.

## Implemented editing catalog

Color grades: Clean, Cinematic, HDR look, Warm, Cool, Monochrome, Punchy detail, Teal + orange, Vintage film, Bleach bypass.

Visual effects: None, Pixel sort, Glitch burst, CRT scan, Halftone reveal, Ripple drift, Motion echo, Threshold melt.

The roster favors visible structural transformations over grade-like overlays:

- **Pixel sort** tears eligible luma intervals into coherent seeded streaks across the frame while keeping strong edges anchored.
- **Glitch burst** schedules deterministic, clean-separated digital events that displace horizontal slices and offset channels inside those slices.
- **CRT scan** combines fine moving raster lines with a restrained rolling sync band, local jitter, brightness lift, and chroma offset.
- **Halftone reveal** moves into a monochrome luma-driven dot screen and resolves back to the source.
- **Ripple drift** samples the source through a slowly drifting crossed-wave displacement field.
- **Motion echo** runs after camera motion so highlights leave decaying temporal trails before clearing.
- **Threshold melt** sweeps into a dithered, oscillating two-tone treatment and resolves back to full color.

Pixel sort, glitch burst, halftone reveal, ripple drift, and threshold melt implement one shared deterministic JavaScript plugin interface. Canvas preview calls each plugin's `renderFrame` function directly. Export calls the same function for a morphology sequence at half the output frame rate and uses the same absolute-seconds envelope, phase, progress, intensity curve, and drifting-seed convention. FFmpeg duplicates those prepared frames to the requested output rate. Every effect, including the FFmpeg-side CRT scan and motion echo stages, is exactly clean at frame zero and the final frame for loop safety.

The canonical effect order is structural plugin sequence → camera motion → CRT scan/motion echo → color grade. This order is deliberate: geometry changes the source first, temporal trails can follow the virtual camera, and grading remains a finishing operation rather than masquerading as an effect.

Browser-local projects and history snapshots may still contain retired IDs. On restore and in Visual Expert vocabulary, `rgb-split` maps to `glitch-burst`, `scanlines` maps to `crt-scan`, and `film-grain`, `glow`, `dream`, `vignette`, `blur`, `loop`, `halation`, and `anamorphic-bloom` map to `none`. Director surfaces the substitution in an applied/restored-action receipt and suggests the closest color-grade treatment where appropriate; it never silently claims that a retired effect still rendered.

Transitions: Cut, Crossfade, Dip to black, Slide left, Slide right, Iris reveal, Soft dissolve.

Motion: Still, Push in, Pull out, Pan left, Pan right, Pan up, Pan down, Drift up-left, Drift down-right, Pulse.

Project controls: 9:16, 1:1, 16:9; 24 or 30 fps; draft 540p, balanced 720p, high 1080p, maximum low-compression 1080p; optional captions of up to 180 characters and local music. Every selector uses Director's compact portal menu instead of an operating-system native select popup.

“HDR look” is an SDR contrast, saturation, sharpening, and tone treatment. It is not HDR mastering, an HDR transfer function, or HDR metadata.

Caption layout is implemented once for preview and export: normalized whitespace, bounded multiline wrapping, a maximum of three lines, truncation when necessary, and a lower-frame safe margin.

## Rendering behavior

FFmpeg is not part of the initial JavaScript bundle. The `@ffmpeg/ffmpeg` wrapper is code-split, while the exact single-thread `@ffmpeg/core` 0.12.10 JavaScript and WebAssembly assets are downloaded from jsDelivr only after **Render on this device** is confirmed. The download is converted to temporary blob URLs for the Worker and those URLs are revoked after the attempt. Browser HTTP caching may avoid a repeat transfer, but Director Open does not install its own service worker or offline cache.

The fallback Worker also adds the isolation headers that a future opt-in multi-thread engine will require:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
Permissions-Policy: cross-origin-isolated=(self)
```

The ffmpeg.wasm multi-thread core is not the default because end-to-end testing exposed a Chromium/Web Worker combination that could stall after H.264 stream setup. The presence of `SharedArrayBuffer` is not treated as proof that the path is dependable. Multi-threading may return only as an explicitly experimental mode with a watchdog, automatic termination, tested stable-core fallback, honest UI wording, and cross-browser verification. Output settings are the same; this engine choice changes speed, not the requested grade or resolution.

The current H.264 pipeline uses `libx264`, `yuv420p`, `+faststart`, the `veryfast` preset at every tier, a CRF of 24/19/16/12 for draft/balanced/high/maximum, and optional AAC audio at 128/192 kbps. Texture-critical renders add x264's grain tuning so fine streaks and dither are less likely to be smoothed away. Maximum keeps the 1080p frame at the lowest compression and is therefore intentionally slower and usually larger even though the preset is unchanged. Moving stills are first scaled to a 1.18× working frame, animated as one continuous `zoompan` sequence with integer-aligned coordinates, then downscaled to the requested output. That sequence prevents fractional crop quantization from appearing as export-only shake. Music loops and is trimmed with the video; Director Open does not yet expose volume or fades.

## Adobe backend

Selecting **Adobe After Effects** never silently invokes a paid plugin. In the
local Director app, one click prepares every selected structural effect with
Director's shared exact frame engine, creates a temporary handoff under
`~/Library/Caches/Director/Adobe Handoffs`, discovers the sibling Conductor
`conductor.config.json`, sends the validated plan to the existing Adobe MCP,
saves the After Effects project, renders only the newly created queue item
through `aerender`, verifies the output, and moves the finished movie directly
to `~/Movies/Director/<reel>-<timestamp>-adobe.<ext>`. **Show output** asks the
local service to reveal that exact file in Finder. Successful temporary
handoffs are removed; a failed handoff is retained in the cache for replay.
There is no Chrome directory picker. `DIRECTOR_OUTPUT_ROOT` and
`DIRECTOR_ADOBE_CONFIG` may override those presets.

Static/hosted builds cannot write an arbitrary macOS path, so they automatically
download the same complete ZIP to the browser's configured Downloads folder.
The CLI remains available for manually replaying any retained package:

```sh
node packages/director-adobe/dist/cli.js \
  --plan ./My-Reel.director-adobe.json \
  --config /path/to/conductor.config.json
```

The two owned effect contracts are `director-pixel-sort` and
`director-beat-sync`. Beat Sync is already implemented through AE's native
**Convert Audio to Keyframes** command and writes a reusable marker map, `Beat
Pulse` slider, adaptive beat threshold, and custom-effect keyframes. The
execution receipt distinguishes native equivalents from built-in
approximations and unsupported mappings. Pixel Sort and the other structural
effects are baked with the same deterministic Director engine used by preview
and FFmpeg export, so After Effects receives the selected effect rather than a
blur-based approximation. The plate is currently 8-bit RGBA video; After
Effects then performs grades, transitions, text, beat controls, composition,
and finishing in the 32-bpc project. The float pixel-sort kernel is in
`packages/director-adobe/native/`; the final native AE effect adapter remains
gated on the separately licensed Adobe SDK and is never pretended to be
installed. If neither an exact prepared plate nor the native adapter is
available, Director fails explicitly instead of substituting blur.

Director prefers a saved QuickTime/ProRes 4444 output-module template matching
one of the names in the plan. When it is absent, Director uses the installed
`IG HDR HLG ProRes` template as an Adobe 10-bit intermediate, then applies
Conductor's proven HEVC Main 10 delivery step and verifies BT.2020/HLG tags
with ffprobe. The intermediate is removed only after that verification. If
neither Adobe profile exists, Director fails with the available template list
instead of silently queuing AE's default codec.

## Reliability and resource boundaries

- Maximum 16 still-image clips, 12 seconds per clip, and a 90-second compiled timeline after transition overlaps are applied.
- Maximum 64 MB per image, 128 MB for a local audio file, and 256 MB aggregate input written to the in-memory FFmpeg filesystem. Caption overlays count toward the aggregate during preparation.
- Local images are allowlisted as JPEG, PNG, or WebP. Local audio is allowlisted as MP3, M4A/AAC, WAV, FLAC, Ogg, or WebM.
- Remote media is rejected at the local-media boundary. Render inputs must resolve to browser-owned `File`/`Blob` data or locally generated frames; the Worker never receives, stores, fetches, or proxies them.
- Dynamic wrapper loading, both core downloads, and engine initialization share one abortable 90-second watchdog. FFmpeg execution has a separate duration-scaled timeout from two to fifteen minutes for ordinary edits and five to twenty minutes for premium mask effects, and remains user-cancellable.
- Each render has an ownership token. Cancellation enters a stopping state and retry becomes available only after the prior promise settles, preventing callbacks from an old Worker from updating a newer render.
- A render fingerprint covers object-URL media identity and all visible project settings. Any later edit revokes a completed output, and an in-flight job whose fingerprint no longer matches is discarded instead of offering a stale MP4.
- After every render, Director runs its bounded ISO-BMFF parser over the output bytes and reports container structure, tracks, codecs, dimensions, duration, frame evidence, and file-size sanity against the compiled project. Failed checks inform the user but never block the MP4 download.
- Device-memory and logical-core hints produce an honest 1080p warning on constrained devices. These browser hints are approximate and are not a guarantee of render success.

## Integration requirements

- Serve the compiled application from the `/director` base path. The deployed Worker remains static-only and rejects `/api/*`; local Vite development adds the loopback-only Adobe output endpoint and otherwise falls back to a ZIP download.
- Accept render images only from browser-local `File` objects and their blob URLs; remote image inputs are outside the trust boundary.
- Preserve the isolation headers above for a future opt-in multi-thread export mode.
- Audit authentication popups and third-party embeds before enabling `Cross-Origin-Opener-Policy` on the production route.
- Keep the single-thread engine as the dependable default even when `SharedArrayBuffer` is exposed.
- Keep local `File` objects, object URLs, filenames, and media bytes out of Worker and AI-provider requests. IndexedDB is the deliberate browser-local persistence boundary for imported media blobs.
- Keep the Content Security Policy compatible with same-origin application assets, browser blob Workers/media, and the exact jsDelivr core origin while it remains a runtime dependency.
- Complete FFmpeg/libx264 licensing review before commercial distribution.

## Preview-to-export boundary

The shared timeline, caption routines, structural-effect plugins, absolute-seconds envelope, and seeded frame sampling make timing, clip order, transition duration, captions, project dimensions, frame rate, effects, and motions deterministic inputs to both preview and export. JavaScript structural effects share their pixel renderer, while CRT scan, motion echo, transitions, and final encoding remain FFmpeg operations; Canvas is therefore a close editing preview rather than a promise of pixel-identical FFmpeg output. The encoded MP4 and its verification report are authoritative.

## Current boundary and roadmap

This is a coherent still-image-and-music reel editor, not a browser clone of Premiere Pro or After Effects. It ships the complete architectural path from chat to an accountable executable FFmpeg edit or Adobe handoff, plus browser-local project and media recovery through IndexedDB and reel undo/redo. It does **not** currently provide video-clip editing, browser waveforms or FFmpeg-side beat snapping, audio volume/fades, multilayer composition in the browser, masks, true HDR output from the FFmpeg H.264 path, persistent File System Access handles, hardware-accelerated WebCodecs export, an offline FFmpeg core, or pixel-identical transition preview.

Reasonable next increments are:

1. Video-clip decode, trim, and speed controls through WebCodecs with FFmpeg compatibility fallback.
2. Audio waveform, beat detection, beat snapping, fades, and per-clip sound.
3. Multi-layer overlays, masks, keyframes, text templates, logos, and safe-area guides.
4. Bounded undo/redo command history and explicit browser-storage management controls.
5. WebCodecs hardware-accelerated export with FFmpeg reserved for filters, muxing, and unsupported codecs.
6. A reduced, self-hosted and license-reviewed FFmpeg core containing only the decoders, filters, muxers, and encoders Director actually uses. The current exact core is larger than Cloudflare's ordinary single static-asset limit, so this needs a deliberate packaging/delivery design rather than a cosmetic URL change.
