# Model implementation

## Essential reasoning work

The Director reasoning layer can map each source to explicit inheritance channels, reconcile conflicting visual signals, preserve locks and exclusions, compile a Direction brief, plan a three-to-eight-beat sequence, and identify continuity drift.

Every canvas mutation is represented by a bounded structured action. The browser applies selection, inheritance, removal, goal, and exclusion actions only against known object identifiers. The local library is user-owned and starts empty; providers cannot search a remote corpus, invent an image URL, or use an unknown object ID to mutate the board.

The same accountability boundary now covers Reel Studio. A provider may propose open, add, remove, reorder, style, project-setting, or render-request actions. The browser validates the shared schema, resolves only current object/clip IDs, normalizes values and transition math, applies actual changes, then replaces the proposal with sanitized applied-action receipts. Unknown targets, unsupported catalog values, duplicates, and no-op actions cannot be displayed as completed edits. A render request opens a local confirmation step; the provider cannot start or claim completion of FFmpeg rendering.

## Runtime implementations

The Worker is static-only and has no provider credentials or AI endpoints. The browser supports four optional adapters:

- OpenAI Responses, streamed from `api.openai.com` with `store: false`.
- Anthropic Messages, streamed from `api.anthropic.com` with the explicit direct-browser header.
- Google Gemini streamed generation from `generativelanguage.googleapis.com`.
- OpenAI-compatible Custom/local chat completions for tools such as Ollama, LM Studio, and vLLM.

Model names are user-editable. Credentials live only in the browser's namespaced AI settings entry and are placed in provider request headers, never URLs. If no provider is configured, AI controls show a setup state and every non-AI editor feature remains available.

Providers stream a short explanation followed by a sentinel-delimited JSON action array. The complete array is parsed and Zod-validated before a proposal card appears. Malformed JSON or a schema-invalid action fails closed. Valid actions remain pending until the user presses Apply; Discard performs no mutation.

The request sends compact summaries and bounded active project state rather than image binaries. Reel context includes current IDs, selection, duration, effect, transition, motion, intensity, caption text, aspect ratio, frame rate, and quality. Filenames and media titles are omitted; `File` objects, object URLs, image/audio bytes, generated frames, and rendered-video bytes never enter the request. No model key is stored in the repository or project history.

Manual reel changes are reflected in the next turn because context is created from the latest normalized project. Empty action targets mean the valid current selection, or all clips when no clip is selected. Explicit stale IDs do not silently expand to all clips. “All,” “every,” and “entire reel” are represented with current clip IDs and rechecked by the browser.
