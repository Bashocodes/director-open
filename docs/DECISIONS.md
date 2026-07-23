# Decision log

## Standalone local library

The open-source project has no external gallery or asset-service dependency. Its library starts empty and accepts user-selected JPEG, PNG, and WebP files. Local media remains inside the browser: imported blobs persist in IndexedDB for refresh recovery, while portable project JSON and model context exclude their bytes, filenames, and runtime object URLs.

## Structured action boundary

Model output is parsed with the shared Zod schema. Canvas and reel mutations resolve only against current object and clip identifiers, and the browser replaces proposals with sanitized applied-action receipts. Unsupported, stale, duplicate, or no-op actions cannot be represented as completed changes.

## Browser-local rendering

Preview remains interactive without loading FFmpeg. Final rendering begins only after explicit confirmation, runs through the pinned single-thread FFmpeg.wasm core, and produces a local H.264 MP4. All temporary files, Workers, and generated core URLs are cleaned up after each attempt.

## Browser-local recovery

Canvas metadata, conversation, creative artifacts, reel settings, and imported image/audio bytes for the active project are persisted locally in IndexedDB. Eight bounded history summaries remain schema-validated in local storage. Temporary blob URLs and rendered output are never persisted.

## Neutral deployment

The Cloudflare Worker is configured only for its own `workers.dev` deployment by default. It contains no zone route, account identifier, private service binding, or external asset origin.
