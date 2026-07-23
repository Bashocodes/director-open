# Model implementation

## Essential reasoning work

The Director reasoning layer can map each source to explicit inheritance channels, reconcile conflicting visual signals, preserve locks and exclusions, compile a Direction Contract, plan a three-to-eight-beat sequence, and identify continuity drift.

Every canvas mutation is represented by a bounded structured action. The browser applies selection, inheritance, removal, goal, and exclusion actions only against known object identifiers. The local library is user-owned and starts empty; providers cannot search a remote corpus, invent an image URL, or use an unknown object ID to mutate the board.

The same accountability boundary now covers Reel Studio. A provider may propose open, add, remove, reorder, style, project-setting, or render-request actions. The browser validates the shared schema, resolves only current object/clip IDs, normalizes values and transition math, applies actual changes, then replaces the proposal with sanitized applied-action receipts. Unknown targets, unsupported catalog values, duplicates, and no-op actions cannot be displayed as completed edits. A render request opens a local confirmation step; the provider cannot start or claim completion of FFmpeg rendering.

## Runtime implementations

The deployed Worker defaults to OpenAI Responses with GPT-5.4. GPT-5.4 mini is the faster OpenAI selector option, while Gemini 3.5 Flash remains available as the third choice. API credentials are stored only as server-side Cloudflare Worker secrets and never enter browser code, repository files, or project history.

The deterministic path still returns schema-valid contracts, stories, continuity findings, and executable canvas/reel actions when a selected live provider is not configured. Its intent routing follows the same action contract and selected/all targeting rules as a live provider, and deterministic output is not labeled as live-model reasoning. A configured provider failure fails closed instead of being mislabeled as a demo result.

The live-provider paths are:

- OpenAI Responses with [`gpt-5.4`](https://developers.openai.com/api/docs/models/gpt-5.4) or [`gpt-5.4-mini`](https://developers.openai.com/api/docs/models/gpt-5.4-mini), medium reasoning, Zod-backed [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), `store: false`, and a bounded safety identifier.
- Gemini 3.5 Flash with JSON Schema output and Zod validation.

The provider-facing JSON schema and application validation describe the same action protocol, and the final response is parsed with the shared Zod schema before any action is considered. A malformed or unsupported provider response fails closed without corrupting project state.

The request sends compact summaries and bounded active project state rather than image binaries. Canvas objects are capped at 120 and recent conversation at 10 turns. Reel context includes current IDs, neutralized titles, selection, duration, effect, transition, motion, intensity, caption text, aspect ratio, frame rate, and quality. For local clips, filenames are replaced with `Local image N`; `File` objects, object URLs, image/audio bytes, and rendered-video bytes never enter the request. No model key is stored in the repository.

Manual reel changes are reflected in the next turn because context is created from the latest normalized project. Empty action targets mean the valid current selection, or all clips when no clip is selected. Explicit stale IDs do not silently expand to all clips. “All,” “every,” and “entire reel” are represented with current clip IDs and rechecked by the browser.
