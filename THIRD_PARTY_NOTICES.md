# Third-party notices

## FFmpeg.wasm wrapper

Director V2.1 uses the `@ffmpeg/ffmpeg` 0.12.15 JavaScript wrapper, distributed under the MIT License. Package source, license text, and build documentation are available from the official [ffmpeg.wasm repository](https://github.com/ffmpegwasm/ffmpeg.wasm) and [ffmpeg.wasm documentation](https://ffmpegwasm.netlify.app/docs/overview/).

## FFmpeg core and libx264

At render time Director downloads the official single-thread `@ffmpeg/core` 0.12.10 JavaScript/WebAssembly distribution from jsDelivr. Its package is licensed `GPL-2.0-or-later` and contains an FFmpeg n5.1.4 build with x264 0.164. Director invokes libx264 to create H.264 video. FFmpeg's [legal guidance](https://ffmpeg.org/legal.html) explains the effect of enabling GPL components such as libx264; upstream code is available from the current [ffmpeg.wasm source repository](https://github.com/ffmpegwasm/ffmpeg.wasm), its archived [historical core source mirror](https://github.com/ffmpegwasm/ffmpeg.wasm-core), and FFmpeg's official [source/download page](https://ffmpeg.org/download.html).

This repository records the exact runtime component for review. Delivery from a CDN does not by itself determine or discharge a distributor's obligations. Before broader production distribution, project maintainers should complete a qualified licensing review and implement any required license, notice, and corresponding-source process, or select and verify a different encoding distribution. This document records evidence; it does not decide those obligations.

## Security-maintenance note

Pinning the n5.1.4-based core preserves the stable browser-render path that was verified for Director, but it also carries a maintenance tradeoff: the pinned build should not be assumed to contain fixes added to later FFmpeg releases. FFmpeg publishes its [security advisories and supported release status](https://ffmpeg.org/security.html). Any core update should be evaluated deliberately, then regression-tested for decoding untrusted inputs, filter compatibility, H.264/AAC output, cancellation, cleanup, and the Chromium stall that prevented the multi-thread build from becoming the default.

This notice is informational and is not legal advice.
