# Privacy

Director Open is local-first by architecture: images, audio, previews, generated frames, and rendered video stay inside the browser on the device where they were selected.

## Where data lives

- The active project is stored in browser IndexedDB. This includes the timeline, actions, settings, conversation state, imported image blobs, and imported audio blobs.
- Small schema-validated metadata, recovery summaries, and optional AI provider settings are also kept in browser local storage.
- Browser object URLs are temporary views of local blobs. They are revoked when media is replaced or removed, when an output becomes stale, and when the editor unmounts.
- FFmpeg.wasm receives local bytes only after the user confirms a render. Its temporary input and output files are deleted and its worker memory is terminated after success, failure, or cancellation.

Browser storage is subject to the browser's quota and clearing controls. If IndexedDB cannot save a project, the interface reports that storage is full or unavailable rather than claiming the media was saved.

## Network boundary

The Worker serves only the compiled static application. Every `/api/*` request is rejected; the Worker has no chat, AI, health, upload, media, analytics, or telemetry endpoint.

The Worker has no media upload route, media store, image search, image proxy, or video endpoint. Director Open does not fetch remote demo media. The FFmpeg JavaScript/WebAssembly program is downloaded on demand from jsDelivr as executable application code; no user media is sent to that CDN.

Optional AI calls go directly from the browser to the selected OpenAI, Anthropic, Google Gemini, or user-supplied OpenAI-compatible endpoint. Provider credentials are kept in one namespaced browser `localStorage` entry, rendered masked, and sent only in request headers to the selected provider—never in a URL, Worker request, log, repository file, or saved project.

AI requests contain conversation text plus a compact, token-budgeted description of canvas IDs, selection, creative settings, effects, durations, aspect ratio, and recent validated actions. They do not contain image or audio bytes, `File` objects, object URLs, local filenames, generated frames, or rendered output. OpenAI requests set `store: false`. Each provider applies its own data-use and retention terms, so users should review their chosen provider's policy before enabling AI.

## Analytics and identity

Director Open includes no analytics, advertising tracker, user-account system, production database, or telemetry endpoint. Project session identifiers remain local and are not sent to the Worker or AI providers.
