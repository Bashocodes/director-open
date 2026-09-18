# Sample images

Two images ship with Director Open so a first run has something to work on
without anyone having to commit their own media first.

| File | Size | Description |
| --- | --- | --- |
| `concept-vehicle.jpg` | 1456×832 | Clean industrial form on a flat backdrop with hot glowing wheels. Exercises anamorphic streak, halation bloom, neon edge. |
| `mountain-night.jpg` | 800×1520 | A lit peak behind a foreground of scrub and rock. Exercises tilt shift, colour grades, camera moves. |

The pair is deliberately mixed: one landscape and one portrait, so the crop
behaviour of the 16:9, 1:1 and 9:16 output frames is visible immediately; and
one clean-and-graphic against one deep-and-detailed, so the two halves of the
effect library both have something to bite on.

## Provenance and licence

Both images were generated with Midjourney by the author of this repository,
Sharan Ramakrishna (cyberyogi), who owns them and contributes them to this project under the same
MIT licence as the code (see `LICENSE`).

They depict no real person and no religious subject, and are not derived from
third-party photography, stock libraries, or another artist's work. They are
re-encoded from the originals to keep the repository small; the full-resolution
files are not distributed.

## Replacing them

Nothing in the application treats these as special — they load through the same
import path as any local file, and the MIME type is derived from the file name
rather than whatever the host serves them as. To swap them:

1. Replace the files in this directory, or add new ones.
2. Update `SAMPLE_IMAGES` in `src/pages/director/reel/sampleMedia.ts` to match
   the new file names, titles and notes.
3. Record the provenance and licence of whatever you add in this file. Do not
   add images you do not have the right to redistribute under MIT.
