# Privacy boundary

Director Open is a standalone, local-first application. It has no production database, user-account system, remote image library, corpus search, image proxy, or private service binding.

## Repository policy

The repository may contain source code, public package dependencies, lockfiles, schemas, tests, documentation, and empty configuration examples. It must not contain production environment values, provider credentials, tokens, account identifiers, private URLs, user data, or private media.

## Runtime data policy

- A Director turn contains bounded canvas state and compact metadata, not image binaries.
- OpenAI and Gemini credentials are optional server-side Worker secrets. They are never sent to the browser or committed.
- OpenAI Responses requests use `store: false`.
- User identity is represented by a random session identifier, not an email or database identifier.
- Reel planning sends bounded IDs and edit settings. Local filenames are replaced with neutral labels before model context is created.
- Local image/audio bytes, browser `File` objects, object URLs, and rendered MP4 bytes never enter Worker or model requests.
- Local media is held in browser memory and copied into FFmpeg.wasm's temporary in-memory filesystem only after render confirmation.
- The app does not silently persist local media bytes or file handles.
- Local imports are restricted to supported still-image and audio formats with bounded file, aggregate-input, clip-count, and timeline limits.
- FFmpeg inputs and outputs are deleted from its in-memory filesystem after every attempt. Workers and temporary blob URLs are terminated or revoked on completion, cancellation, failure, or unmount.
- The FFmpeg JavaScript/WebAssembly core is downloaded on demand from jsDelivr. Local media is never sent to that CDN.

## Persistence and exports

Schema-validated project metadata, conversation, creative artifacts, and up to eight recovery snapshots are stored in browser-local storage. Local media bytes, object URLs, audio, and rendered downloads are deliberately excluded and must be selected again after refresh.

The final MP4 is exposed as a browser object URL. It is revoked when the edit changes or the editor unmounts.
