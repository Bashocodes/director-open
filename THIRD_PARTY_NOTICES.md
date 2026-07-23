# Third-party notices

Director Open includes or depends on software written by other authors. The
project's MIT license does not replace the licenses listed here.

This inventory was regenerated on 2026-07-23 from `pnpm-lock.yaml`, the
installed pnpm production dependency closure, package metadata, and the
license files shipped in `node_modules`. It intentionally includes type-only
packages found in the production closure even when Vite does not emit them
into the browser bundle. Development-only tools are identified separately
below.

Run `pnpm licenses list --prod --long` after changing dependencies and update
this file when the resolved versions or license notices change.

## Production dependency inventory

An asterisk marks a direct dependency. Every other row is transitive.

| Package | Resolved version | License |
| --- | ---: | --- |
| `@ffmpeg/ffmpeg` * | 0.12.15 | MIT |
| `@ffmpeg/types` | 0.12.4 | MIT |
| `@types/d3-color` | 3.1.3 | MIT |
| `@types/d3-drag` | 3.0.7 | MIT |
| `@types/d3-interpolate` | 3.0.4 | MIT |
| `@types/d3-selection` | 3.0.11 | MIT |
| `@types/d3-transition` | 3.0.9 | MIT |
| `@types/d3-zoom` | 3.0.8 | MIT |
| `@types/prop-types` | 15.7.15 | MIT |
| `@types/react` | 18.3.31 | MIT |
| `@types/react-dom` | 18.3.7 | MIT |
| `@xyflow/react` * | 12.11.2 | MIT |
| `@xyflow/system` | 0.0.79 | MIT |
| `classcat` | 5.0.5 | MIT |
| `csstype` | 3.2.3 | MIT |
| `d3-color` | 3.1.0 | ISC |
| `d3-dispatch` | 3.0.1 | ISC |
| `d3-drag` | 3.0.0 | ISC |
| `d3-ease` | 3.0.1 | BSD-3-Clause |
| `d3-interpolate` | 3.0.1 | ISC |
| `d3-selection` | 3.0.0 | ISC |
| `d3-timer` | 3.0.1 | ISC |
| `d3-transition` | 3.0.1 | ISC |
| `d3-zoom` | 3.0.0 | ISC |
| `js-tokens` | 4.0.0 | MIT |
| `loose-envify` | 1.4.0 | MIT |
| `lucide-react` * | 0.554.0 | ISC, with MIT-licensed Feather portions |
| `react` * | 18.3.1 | MIT |
| `react-dom` * | 18.3.1 | MIT |
| `scheduler` | 0.23.2 | MIT |
| `use-sync-external-store` | 1.6.0 | MIT |
| `zod` * | 4.4.3 | MIT |
| `zustand` | 4.5.7 | MIT |

### Director MCP production closure

The `packages/director-mcp` workspace adds the following installed production
closure. `zod` 4.4.3 is shared with the application and already appears in the
table above. The SDK is the only additional direct dependency; all other rows
below are transitive dependencies resolved by pnpm.

| Package | Resolved version | License |
| --- | ---: | --- |
| `@modelcontextprotocol/sdk` * | 1.29.0 | MIT |
| `@hono/node-server` | 1.19.14 | MIT |
| `accepts` | 2.0.0 | MIT |
| `ajv` | 8.20.0 | MIT |
| `ajv-formats` | 3.0.1 | MIT |
| `body-parser` | 2.3.0 | MIT |
| `bytes` | 3.1.2 | MIT |
| `call-bind-apply-helpers` | 1.0.2 | MIT |
| `call-bound` | 1.0.4 | MIT |
| `content-disposition` | 1.1.0 | MIT |
| `content-type` | 1.0.5 | MIT |
| `content-type` | 2.0.0 | MIT |
| `cookie` | 0.7.2 | MIT |
| `cookie-signature` | 1.2.2 | MIT |
| `cors` | 2.8.6 | MIT |
| `cross-spawn` | 7.0.6 | MIT |
| `debug` | 4.4.3 | MIT |
| `depd` | 2.0.0 | MIT |
| `dunder-proto` | 1.0.1 | MIT |
| `ee-first` | 1.1.1 | MIT |
| `encodeurl` | 2.0.0 | MIT |
| `es-define-property` | 1.0.1 | MIT |
| `es-errors` | 1.3.0 | MIT |
| `es-object-atoms` | 1.1.2 | MIT |
| `escape-html` | 1.0.3 | MIT |
| `etag` | 1.8.1 | MIT |
| `eventsource` | 3.0.7 | MIT |
| `eventsource-parser` | 3.1.0 | MIT |
| `express` | 5.2.1 | MIT |
| `express-rate-limit` | 8.6.0 | MIT |
| `fast-deep-equal` | 3.1.3 | MIT |
| `fast-uri` | 3.1.4 | BSD-3-Clause |
| `finalhandler` | 2.1.1 | MIT |
| `forwarded` | 0.2.0 | MIT |
| `fresh` | 2.0.0 | MIT |
| `function-bind` | 1.1.2 | MIT |
| `get-intrinsic` | 1.3.0 | MIT |
| `get-proto` | 1.0.1 | MIT |
| `gopd` | 1.2.0 | MIT |
| `has-symbols` | 1.1.0 | MIT |
| `hasown` | 2.0.4 | MIT |
| `hono` | 4.12.31 | MIT |
| `http-errors` | 2.0.1 | MIT |
| `iconv-lite` | 0.7.3 | MIT |
| `inherits` | 2.0.4 | ISC |
| `ip-address` | 10.2.0 | MIT |
| `ipaddr.js` | 1.9.1 | MIT |
| `is-promise` | 4.0.0 | MIT |
| `isexe` | 2.0.0 | ISC |
| `jose` | 6.2.4 | MIT |
| `json-schema-traverse` | 1.0.0 | MIT |
| `json-schema-typed` | 8.0.2 | BSD-2-Clause |
| `math-intrinsics` | 1.1.0 | MIT |
| `media-typer` | 1.1.0 | MIT |
| `merge-descriptors` | 2.0.0 | MIT |
| `mime-db` | 1.54.0 | MIT |
| `mime-types` | 3.0.2 | MIT |
| `ms` | 2.1.3 | MIT |
| `negotiator` | 1.0.0 | MIT |
| `object-assign` | 4.1.1 | MIT |
| `object-inspect` | 1.13.4 | MIT |
| `on-finished` | 2.4.1 | MIT |
| `once` | 1.4.0 | ISC |
| `parseurl` | 1.3.3 | MIT |
| `path-key` | 3.1.1 | MIT |
| `path-to-regexp` | 8.4.2 | MIT |
| `pkce-challenge` | 5.0.1 | MIT |
| `proxy-addr` | 2.0.7 | MIT |
| `qs` | 6.15.3 | BSD-3-Clause |
| `range-parser` | 1.3.0 | MIT |
| `raw-body` | 3.0.2 | MIT |
| `require-from-string` | 2.0.2 | MIT |
| `router` | 2.2.0 | MIT |
| `safer-buffer` | 2.1.2 | MIT |
| `send` | 1.2.1 | MIT |
| `serve-static` | 2.2.1 | MIT |
| `setprototypeof` | 1.2.0 | ISC |
| `shebang-command` | 2.0.0 | MIT |
| `shebang-regex` | 3.0.0 | MIT |
| `side-channel` | 1.1.1 | MIT |
| `side-channel-list` | 1.0.1 | MIT |
| `side-channel-map` | 1.0.1 | MIT |
| `side-channel-weakmap` | 1.0.2 | MIT |
| `statuses` | 2.0.2 | MIT |
| `toidentifier` | 1.0.1 | MIT |
| `type-is` | 2.1.0 | MIT |
| `unpipe` | 1.0.0 | MIT |
| `vary` | 1.1.2 | MIT |
| `which` | 2.0.2 | ISC |
| `wrappy` | 1.0.2 | ISC |
| `zod-to-json-schema` | 3.25.2 | ISC |

## Runtime-downloaded FFmpeg core

`@ffmpeg/core` is not an installed dependency and is not included in the
production table above. When a user starts an export, the application
downloads the single-thread `@ffmpeg/core` 0.12.10 JavaScript loader and
WebAssembly binary from jsDelivr. The package metadata declares
`GPL-2.0-or-later`; the published npm archive contains only the loader,
WebAssembly files, and `package.json`, and does not include a standalone
license file.

The official monorepo's
[core 0.12.10 release commit](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/71aa99d37c02a7b4c435275ca9ef50e612f6efa1)
changes `packages/core/package.json` from 0.12.9 to 0.12.10. The build recipe
at that commit specifies FFmpeg n5.1.4 and is configured with `--enable-gpl`,
`--enable-libx264`, and other external libraries. The application invokes
`libx264` for H.264 exports. See
[`docs/FFMPEG_LICENSING.md`](./docs/FFMPEG_LICENSING.md) for exact URLs,
source links, license scope, provenance limits, and downstream-distribution
guidance.

Relevant upstream materials:

- [ffmpeg.wasm core 0.12.10 release commit](https://github.com/ffmpegwasm/ffmpeg.wasm/commit/71aa99d37c02a7b4c435275ca9ef50e612f6efa1)
- [Build recipe at the release commit](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/71aa99d37c02a7b4c435275ca9ef50e612f6efa1/Dockerfile)
- [FFmpeg n5.1.4 source](https://github.com/FFmpeg/FFmpeg/tree/n5.1.4)
- [Moving `4-cores` branch referenced by that recipe](https://github.com/ffmpegwasm/x264/tree/4-cores)
- [GNU GPL version 2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html)
- [FFmpeg license explanation](https://github.com/FFmpeg/FFmpeg/blob/n5.1.4/LICENSE.md)

The npm registry metadata does not record a `gitHead`, and the recipe refers
to moving branches for linked libraries. The release commit is the strongest
official source reference identified for this package, but it is not an
artifact attestation or a complete immutable corresponding-source record.
Anyone distributing the downloaded core must assess and satisfy the applicable
GPL obligations, including the license and corresponding-source requirements.
Loading the binary from a CDN does not relicense it or itself resolve those
obligations. This notice is informational, not legal advice.

## Development-only dependencies

The following direct dependencies support local development, tests, builds,
and deployment. They are not application runtime dependencies and are not
included in the production closure or notices above. Their transitive tools
remain governed by the license files in their installed packages.

| Package | Resolved version | Declared license |
| --- | ---: | --- |
| `@cloudflare/workers-types` | 5.20260719.1 | MIT OR Apache-2.0 |
| `@testing-library/jest-dom` | 6.9.1 | MIT |
| `@testing-library/react` | 16.3.2 | MIT |
| `@types/react` | 18.3.31 | MIT |
| `@types/react-dom` | 18.3.7 | MIT |
| `@vitejs/plugin-react` | 5.2.0 | MIT |
| `concurrently` | 9.2.4 | MIT |
| `fake-indexeddb` | 6.2.5 | Apache-2.0 |
| `jsdom` | 27.4.0 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `vite` | 7.3.6 | MIT |
| `vitest` | 4.1.10 | MIT |
| `wrangler` | 4.112.0 | MIT OR Apache-2.0 |

## MIT-licensed components

The following copyright notices accompany the MIT terms reproduced below:

- `@ffmpeg/ffmpeg`, `@ffmpeg/types`: Copyright (c) 2019 Jerome Wu.
  The npm package metadata declares MIT; those package archives omit a
  standalone license file, so this notice is taken from the official
  ffmpeg.wasm repository license.
- `@types/d3-color`, `@types/d3-drag`, `@types/d3-interpolate`,
  `@types/d3-selection`, `@types/d3-transition`, `@types/d3-zoom`,
  `@types/prop-types`, `@types/react`, `@types/react-dom`: Copyright (c)
  Microsoft Corporation.
- `@xyflow/react`, `@xyflow/system`: Copyright (c) 2019-2025 webkid GmbH.
- `classcat`: `Copyright © Jorge Bucaran <<https://jorgebucaran.com>>`.
- `csstype`: Copyright (c) 2017-2018 Fredrik Nicol.
- `js-tokens`: Copyright (c) 2014, 2015, 2016, 2017, 2018 Simon Lydell.
- `loose-envify`: Copyright (c) 2015 Andres Suarez
  `<zertosh@gmail.com>`.
- `react`, `react-dom`, `scheduler`: Copyright (c) Facebook, Inc. and its
  affiliates.
- `use-sync-external-store`: Copyright (c) Meta Platforms, Inc. and
  affiliates.
- `zod`: Copyright (c) 2025 Colin McDonnell.
- `zustand`: Copyright (c) 2019 Paul Henschel.

The additional MIT-licensed MCP runtime packages carry these notices:

- `@modelcontextprotocol/sdk`: Copyright (c) 2024 Anthropic, PBC.
- `@hono/node-server`: Copyright (c) 2022 - present, Yusuke Wada and Hono
  contributors.
- `accepts`, `mime-types`: Copyright (c) 2014 Jonathan Ong
  `<me@jongleberry.com>`; Copyright (c) 2015 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `ajv`: Copyright (c) 2015-2021 Evgeny Poberezkin.
- `ajv-formats`: Copyright (c) 2020 Evgeny Poberezkin.
- `body-parser`, `type-is`: Copyright (c) 2014 Jonathan Ong
  `<me@jongleberry.com>`; Copyright (c) 2014-2015 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `bytes`: Copyright (c) 2012-2014 TJ Holowaychuk
  `<tj@vision-media.ca>`; Copyright (c) 2015 Jed Watson
  `<jed.watson@me.com>`.
- `call-bind-apply-helpers`, `call-bound`, `es-define-property`, `es-errors`,
  `es-object-atoms`, `side-channel-list`, `side-channel-map`: Copyright (c)
  2024 Jordan Harband.
- `content-disposition`, `forwarded`, `media-typer`, `vary`: Copyright (c)
  2014-2017 Douglas Christopher Wilson.
- `content-type` 1.0.5 and 2.0.0: Copyright (c) 2015 Douglas Christopher
  Wilson.
- `cookie`: Copyright (c) 2012-2014 Roman Shtylman
  `<shtylman@gmail.com>`; Copyright (c) 2015 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `cookie-signature`: Copyright (c) 2012–2024 LearnBoost
  `<tj@learnboost.com>` and other contributors.
- `cors`: Copyright (c) 2013 Troy Goode `<troygoode@gmail.com>`.
- `cross-spawn`: Copyright (c) 2018 Made With MOXY Lda
  `<hello@moxy.studio>`.
- `debug`: Copyright (c) 2014-2017 TJ Holowaychuk
  `<tj@vision-media.ca>`; Copyright (c) 2018-2021 Josh Junon.
- `depd`: Copyright (c) 2014-2018 Douglas Christopher Wilson.
- `dunder-proto`, `math-intrinsics`: Copyright (c) 2024 ECMAScript Shims.
- `ee-first`: Copyright (c) 2014 Jonathan Ong `me@jongleberry.com`.
- `encodeurl`: Copyright (c) 2016 Douglas Christopher Wilson.
- `escape-html`: Copyright (c) 2012-2013 TJ Holowaychuk; Copyright (c) 2015
  Andreas Lubbe; Copyright (c) 2015 Tiancheng "Timothy" Gu.
- `etag`, `proxy-addr`: Copyright (c) 2014-2016 Douglas Christopher Wilson.
- `eventsource`: Copyright (c) EventSource GitHub organisation.
- `eventsource-parser`: Copyright (c) 2026 Espen Hovlandsdal
  `<espen@hovlandsdal.com>`.
- `express`: Copyright (c) 2009-2014 TJ Holowaychuk
  `<tj@vision-media.ca>`; Copyright (c) 2013-2014 Roman Shtylman
  `<shtylman+expressjs@gmail.com>`; Copyright (c) 2014-2015 Douglas
  Christopher Wilson `<doug@somethingdoug.com>`.
- `express-rate-limit`: Copyright 2023 Nathan Friedly, Vedant K.
- `fast-deep-equal`, `json-schema-traverse`: Copyright (c) 2017 Evgeny
  Poberezkin.
- `finalhandler`: Copyright (c) 2014-2022 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `fresh`: Copyright (c) 2012 TJ Holowaychuk `<tj@vision-media.ca>`;
  Copyright (c) 2016-2017 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `function-bind`: Copyright (c) 2013 Raynos.
- `get-intrinsic`: Copyright (c) 2020 Jordan Harband.
- `get-proto`: Copyright (c) 2025 Jordan Harband.
- `gopd`: Copyright (c) 2022 Jordan Harband.
- `has-symbols`: Copyright (c) 2016 Jordan Harband.
- `hasown`: Copyright (c) Jordan Harband and contributors.
- `hono`: Copyright (c) 2021 - present, Yusuke Wada and Hono contributors.
- `http-errors`: Copyright (c) 2014 Jonathan Ong `me@jongleberry.com`;
  Copyright (c) 2016 Douglas Christopher Wilson `doug@somethingdoug.com`.
- `iconv-lite`: Copyright (c) 2011 Alexander Shtuchkin.
- `ip-address`: Copyright (C) 2011 by Beau Gunderson.
- `ipaddr.js`: Copyright (C) 2011-2017 whitequark
  `<whitequark@whitequark.org>`.
- `is-promise`: Copyright (c) 2014 Forbes Lindesay.
- `jose`: Copyright (c) 2018 Filip Skokan.
- `merge-descriptors`: Copyright (c) Jonathan Ong
  `<me@jongleberry.com>`; Copyright (c) Douglas Christopher Wilson
  `<doug@somethingdoug.com>`; Copyright (c) Sindre Sorhus
  `<sindresorhus@gmail.com>` (`https://sindresorhus.com`).
- `mime-db`: Copyright (c) 2014 Jonathan Ong `<me@jongleberry.com>`;
  Copyright (c) 2015-2022 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `ms`: Copyright (c) 2020 Vercel, Inc.
- `negotiator`: Copyright (c) 2012-2014 Federico Romero; Copyright (c)
  2012-2014 Isaac Z. Schlueter; Copyright (c) 2014-2015 Douglas Christopher
  Wilson.
- `object-assign`, `path-key`, `shebang-regex`: Copyright (c) Sindre Sorhus
  `<sindresorhus@gmail.com>` (`sindresorhus.com`).
- `object-inspect`: Copyright (c) 2013 James Halliday.
- `on-finished`: Copyright (c) 2013 Jonathan Ong
  `<me@jongleberry.com>`; Copyright (c) 2014 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `parseurl`: Copyright (c) 2014 Jonathan Ong `<me@jongleberry.com>`;
  Copyright (c) 2014-2017 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `path-to-regexp`: Copyright (c) 2014 Blake Embrey
  (`hello@blakeembrey.com`).
- `pkce-challenge`: Copyright (c) 2019.
- `range-parser`: Copyright (c) 2012-2014 TJ Holowaychuk
  `<tj@vision-media.ca>`; Copyright (c) 2015-2016 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `raw-body`: Copyright (c) 2013-2014 Jonathan Ong
  `<me@jongleberry.com>`; Copyright (c) 2014-2022 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `require-from-string`: Copyright (c) Vsevolod Strukchinsky
  `<floatdrop@gmail.com>` (`github.com/floatdrop`).
- `router`: Copyright (c) 2013 Roman Shtylman; Copyright (c) 2014-2022
  Douglas Christopher Wilson.
- `safer-buffer`: Copyright (c) 2018 Nikita Skovoroda
  `<chalkerx@gmail.com>`.
- `send`: Copyright (c) 2012 TJ Holowaychuk; Copyright (c) 2014-2022 Douglas
  Christopher Wilson.
- `serve-static`: Copyright (c) 2010 Sencha Inc.; Copyright (c) 2011
  LearnBoost; Copyright (c) 2011 TJ Holowaychuk; Copyright (c) 2014-2016
  Douglas Christopher Wilson.
- `shebang-command`: Copyright (c) Kevin Mårtensson
  `<kevinmartensson@gmail.com>` (`github.com/kevva`).
- `side-channel`, `side-channel-weakmap`: Copyright (c) 2019 Jordan Harband.
- `statuses`: Copyright (c) 2014 Jonathan Ong `<me@jongleberry.com>`;
  Copyright (c) 2016 Douglas Christopher Wilson `<doug@somethingdoug.com>`.
- `toidentifier`: Copyright (c) 2016 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.
- `unpipe`: Copyright (c) 2015 Douglas Christopher Wilson
  `<doug@somethingdoug.com>`.

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## ISC-licensed components

The ISC license applies to `d3-color`, `d3-dispatch`, `d3-drag`,
`d3-interpolate`, `d3-selection`, `d3-timer`, `d3-transition`, `d3-zoom`,
`inherits`, `isexe`, `once`, `setprototypeof`, `which`, `wrappy`, and
`zod-to-json-schema`.

Copyright 2010-2022 Mike Bostock (`d3-color`)

Copyright 2010-2021 Mike Bostock (the other D3 packages listed above)

Copyright (c) Isaac Z. Schlueter and Contributors (`inherits`, `isexe`,
`once`, `which`, `wrappy`)

Copyright (c) 2015, Wes Todd (`setprototypeof`)

Copyright (c) 2020, Stefan Terdell (`zod-to-json-schema`)

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

## Lucide and Feather notices

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as part
of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
Contributors 2025.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

The MIT License (MIT) (for portions derived from Feather)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## d3-ease BSD-3-Clause notice

Copyright 2010-2021 Mike Bostock

Copyright 2001 Robert Penner

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the author nor the names of contributors may be used to
  endorse or promote products derived from this software without specific
  prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

## fast-uri BSD-3-Clause notice

Copyright (c) 2011-2021, Gary Court until
<https://github.com/garycourt/uri-js/commit/a1acf730b4bba3f1097c9f52e7d9d3aba8cdcaae>

Copyright (c) 2021-present The Fastify team
<https://github.com/fastify/fastify#team>

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice,
  this list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* The names of any contributors may not be used to endorse or promote
  products derived from this software without specific prior written
  permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDERS AND CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

The complete contributor list is available at
<https://github.com/garycourt/uri-js/graphs/contributors>.

## qs BSD-3-Clause notice

Copyright (c) 2014, Nathan LaFreniere and other
[contributors](https://github.com/ljharb/qs/graphs/contributors)

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.

## json-schema-typed BSD-2-Clause notice

Original source code is copyright (c) 2019-2025 Remy Rylan
<https://github.com/RemyRylan>.

All JSON Schema documentation and descriptions are copyright (c):

- 2009 [draft-0] IETF Trust <https://www.ietf.org/>, Kris Zyp
  `<kris@sitepen.com>`, and SitePen (USA) <https://www.sitepen.com/>.
- 2009 [draft-1] IETF Trust <https://www.ietf.org/>, Kris Zyp
  `<kris@sitepen.com>`, and SitePen (USA) <https://www.sitepen.com/>.
- 2010 [draft-2] IETF Trust <https://www.ietf.org/>, Kris Zyp
  `<kris@sitepen.com>`, and SitePen (USA) <https://www.sitepen.com/>.
- 2010 [draft-3] IETF Trust <https://www.ietf.org/>, Kris Zyp
  `<kris@sitepen.com>`, Gary Court `<gary.court@gmail.com>`, and SitePen
  (USA) <https://www.sitepen.com/>.
- 2013 [draft-4] IETF Trust <https://www.ietf.org/>), Francis Galiegue
  `<fgaliegue@gmail.com>`, Kris Zyp `<kris@sitepen.com>`, Gary Court
  `<gary.court@gmail.com>`, and SitePen (USA) <https://www.sitepen.com/>.
- 2018 [draft-7] IETF Trust <https://www.ietf.org/>, Austin Wright
  `<aaa@bzfx.net>`, Henry Andrews `<henry@cloudflare.com>`, Geraint Luff
  `<luffgd@gmail.com>`, and Cloudflare, Inc.
  <https://www.cloudflare.com/>.
- 2019 [draft-2019-09] IETF Trust <https://www.ietf.org/>, Austin Wright
  `<aaa@bzfx.net>`, Henry Andrews `<andrews_henry@yahoo.com>`, Ben Hutton
  `<bh7@sanger.ac.uk>`, and Greg Dennis `<gregsdennis@yahoo.com>`.
- 2020 [draft-2020-12] IETF Trust <https://www.ietf.org/>, Austin Wright
  `<aaa@bzfx.net>`, Henry Andrews `<andrews_henry@yahoo.com>`, Ben Hutton
  `<ben@jsonschema.dev>`, and Greg Dennis `<gregsdennis@yahoo.com>`.

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
