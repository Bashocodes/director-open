# Sample images

Two images ship with Director Open so a first run has something to work on
without anyone having to commit their own media first.

| File | Description |
| --- | --- |
| `temple-panorama.jpg` | Dense architectural detail with real depth. Exercises tilt shift, halftone, camera moves. |
| `graphic-portrait.jpg` | Flat colour and bold line work. Exercises grades, light leaks, edge effects. |

## Provenance and licence

Both images were generated with Midjourney by the author of this repository,
KALAI LABS, who owns them and contributes them to this project under the same
MIT licence as the code (see `LICENSE`). They depict no real person and are not
derived from third-party photography, stock libraries, or another artist's work.

They are downscaled and re-encoded from the originals to keep the repository
small; the full-resolution files are not distributed.

## Replacing them

Nothing in the application treats these as special — they load through the same
import path as any local file. To swap them:

1. Replace the files in this directory, keeping the same names, or add new ones.
2. Update `SAMPLE_IMAGES` in `src/pages/director/reel/sampleMedia.ts` if names,
   titles, or the set itself change.
3. Record the provenance and licence of whatever you add in this file. Do not
   add images you do not have the right to redistribute under MIT.
