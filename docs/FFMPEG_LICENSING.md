# FFmpeg licensing and delivery

Director Open renders on the user's device with ffmpeg.wasm. Two different
pieces are involved, and they do not have the same license or delivery model.

This page describes the current implementation and upstream evidence. It is
not legal advice.

## What is bundled

The application has a direct dependency on `@ffmpeg/ffmpeg` 0.12.15. This is
the browser-facing TypeScript/JavaScript wrapper: it manages the FFmpeg Web
Worker, in-memory filesystem, commands, and messages. Vite includes the
wrapper in the application build as a lazy JavaScript chunk, so it is fetched
only when export code is needed.

The wrapper's npm metadata declares the MIT License. Its only package
dependency is `@ffmpeg/types` 0.12.4, also declared MIT. Neither npm archive
contains FFmpeg itself, x264, or a WebAssembly codec core. The installed
archives omit standalone license files; the official
[ffmpeg.wasm repository license](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/LICENSE)
contains the MIT text and the notice “Copyright (c) 2019 Jerome Wu.”

## What loads at render time

The FFmpeg core is deliberately not part of the repository, pnpm dependency
tree, initial JavaScript, or static Worker assets. After the user confirms an
export, the browser downloads exactly these files:

```text
https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js
https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm
```

The renderer copies those responses into temporary browser Blob URLs, passes
the Blob URLs to the ffmpeg.wasm worker, and revokes them after the render
attempt. User media is written only to FFmpeg's in-memory filesystem; it is
not sent to jsDelivr.

The runtime package is pinned by the `CORE_VERSION` and `CDN_ROOT` constants
in `src/pages/director/reel/ffmpegRenderer.ts`. The single-thread package is
currently selected. The code contains a disabled multi-thread branch, but
`@ffmpeg/core-mt` is not downloaded by the current product.

## Why the core is GPL

The published `@ffmpeg/core` 0.12.10 npm archive declares
`GPL-2.0-or-later`. Its archive contains only the Emscripten JavaScript
loaders, WebAssembly binaries, and package metadata; it does not ship a
standalone copy of the GPL or corresponding source.

The ffmpeg.wasm monorepo does not have a core-specific `v0.12.10` tag. Its
older `v0.12.10` tag is commit
`c3a763857c5e615ae8674715ad5e4f63ff469e9d`, where the core package is only
version 0.12.6, so that tag is not evidence for the runtime used here.

The applicable official source reference is commit
[`71aa99d37c02a7b4c435275ca9ef50e612f6efa1`](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/71aa99d37c02a7b4c435275ca9ef50e612f6efa1),
dated 2025-01-07 and titled “RELEASE: @ffmpeg/core and @ffmpeg/core-mt
v0.12.10.” It changes `packages/core/package.json` from 0.12.9 to 0.12.10.
The monorepo tag `v12.15`, whose number follows the wrapper package rather
than the core package, points to that same commit. The npm registry records
publication of `@ffmpeg/core` 0.12.10 twenty-six seconds after the commit, but
does not provide a `gitHead`.

The [Dockerfile at that release commit](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/Dockerfile)
records these build inputs and flags:

- FFmpeg source tag `n5.1.4`;
- Emscripten 3.1.40;
- the ffmpeg.wasm x264 fork's `4-cores` branch;
- `--enable-gpl`;
- `--enable-libx264` and `--enable-libx265`, along with other codec and
  filter libraries.

The referenced x264 branch currently declares API build 164 in `x264.h` and
is licensed under GPL version 2 or later. The published WebAssembly artifact
contains x264 symbols and an embedded configuration string with
`--enable-gpl` and `--enable-libx264`, directly confirming that x264 is in the
artifact even though the exact x264 source revision is unresolved. FFmpeg
explains that enabling GPL code or combining FFmpeg with GPL libraries such
as libx264 changes the resulting FFmpeg binary to GPL v2 or later. Director
Open explicitly selects `libx264` when encoding H.264 MP4 video.

Useful primary sources:

- [ffmpeg.wasm core 0.12.10 release commit](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/71aa99d37c02a7b4c435275ca9ef50e612f6efa1)
- [Build recipe at the release commit](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/Dockerfile)
- [FFmpeg n5.1.4 source](https://github.com/FFmpeg/FFmpeg/tree/n5.1.4)
- [FFmpeg n5.1.4 license explanation](https://github.com/FFmpeg/FFmpeg/blob/n5.1.4/LICENSE.md)
- [Moving `4-cores` branch referenced by the build recipe](https://github.com/ffmpegwasm/x264/tree/4-cores)
- [x264 GPL version 2 text](https://github.com/ffmpegwasm/x264/blob/4-cores/COPYING)
- [GNU GPL version 2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)

The release commit is the strongest official source reference identified for
the published package, but it is not a cryptographic artifact attestation.
The build recipe names moving branches, rather than immutable commits, for
x264 and several other linked libraries. The npm package and registry
metadata do not provide enough provenance to name the exact revisions used
for those inputs. A downstream distributor needing complete reproducible
corresponding source should resolve that gap rather than treating the release
commit or moving branches as a complete immutable source record.

## What this means for users and downstream distributors

Director Open's own source is MIT-licensed. That MIT grant does not relicense
the FFmpeg/x264 WebAssembly core.

- Running the hosted application is not restricted by the GPL. Exported MP4
  files do not become GPL-licensed merely because FFmpeg encoded them.
- Copyright licensing and codec patent licensing are separate questions.
  GPL compliance does not itself settle every patent-licensing question that
  may be relevant to distributing or using H.264 in a particular
  jurisdiction or product.
- A person or organization that deploys, mirrors, bundles, modifies, or
  otherwise conveys the GPL core must determine which GPL obligations apply
  to that distribution. Those can include preserving notices, supplying the
  GPL terms, and making the complete corresponding source for the exact
  binary available by a GPL-compliant method.
- Modified core builds require corresponding source for the modifications as
  well as the build inputs and scripts needed by the applicable GPL terms.
- Fetching the core from a third-party CDN does not change its license. It
  also should not be assumed, without review, to satisfy the deployer's own
  source-delivery obligations.
- Whether a particular application/core arrangement is one combined work for
  GPL purposes is a fact- and jurisdiction-dependent legal question. This
  repository does not make that determination for downstream users.

Before a public or commercial deployment, maintainers should obtain advice
appropriate to their distribution model, preserve the exact binary and its
source provenance, and implement whatever notice, license-copy, and
corresponding-source process that review requires.

## Planned optional WebCodecs path

The roadmap includes an optional WebCodecs render path. Where a browser and
operating system expose suitable encoders, it can use browser-native
`VideoEncoder`/`AudioEncoder` capabilities and a compatible muxing path for
projects that do not need FFmpeg-only filters. The goals are faster
hardware-assisted export, a smaller on-demand download, and a path that does
not require the GPL FFmpeg core for supported jobs.

WebCodecs codec availability varies by browser, operating system, and hardware,
and the existing effect/filter pipeline is broader than WebCodecs alone. The
planned path must therefore remain optional until output parity and
compatibility are proven. FFmpeg will remain a fallback for unsupported
codecs, filters, and environments during that transition.

Adding WebCodecs does not erase obligations for any release or deployment
that still distributes or loads the GPL core. Licensing must be evaluated per
artifact and per delivery path.

## Maintainer checklist for changing the core

Before changing `CORE_VERSION`, the CDN, build flags, encoder, or core package:

1. Download and inspect the exact published archive and its metadata.
2. Record immutable source revisions for FFmpeg and every linked library.
3. Record configure flags and preserve reproducible build scripts.
4. Re-evaluate the resulting license, notices, source-delivery mechanism, and
   codec patent considerations.
5. Update this page and `THIRD_PARTY_NOTICES.md`.
6. Run the render and export-verification suites against H.264 video, optional
   AAC audio, cancellation, cleanup, and representative effect graphs.
