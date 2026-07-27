# Director Pixel Sort — native Adobe effect boundary

`director_pixel_sort_core.cpp` is the original float RGBA sorting kernel for
the Director Adobe effect. It is deliberately independent of Adobe headers so
the algorithm can be unit-tested and reused by a future non-Adobe renderer.
It keeps the source and destination in floating point throughout; the Adobe
host is not allowed to insert an 8-bit conversion.

The selector uses a multi-octave coherent brush field, luma/saturation
thresholds, and a precomputed Sobel field. It sorts contiguous intervals into
bounded tears rather than making an independent random decision for every
pixel. Scratch buffers are allocated once per frame and reused across runs.

The remaining adapter is intentionally a separate build step because Adobe's
After Effects SDK is licensed and cannot be vendored into Director. Once the
SDK is installed locally, the adapter must implement `PF_Cmd_GLOBAL_SETUP`,
`PF_Cmd_PARAMS_SETUP`, and `PF_Cmd_RENDER`, advertise
`PF_OutFlag2_FLOAT_COLOR_AWARE`, request the `PF_PixelFloat` world, and call
`director_pixel_sort::render_rgba_float` for each frame.

The public parameter contract is:

- `Intensity` — 0–100, normalized to `Params::intensity` 0–1.
- `Phase` — 0–100, normalized to `Params::phase` 0–1.
- `Beat Amount` — 0–100, additive modulation driven by Director Beat Sync.
- `Seed` — deterministic variation, mapped to `Params::seed`.

The ExtendScript bridge already uses the exact effect name
`director-pixel-sort` and animates `Beat Amount` from the native AE Audio
Amplitude layer. If a plan requests the effect and it is not installed, the
bridge fails the transaction; it never substitutes a paid third-party effect
or claims that pixel sorting was rendered.

## Portable kernel test

```sh
c++ -std=c++17 -O2 -Wall -Wextra -pedantic \
  director_pixel_sort_core.cpp director_pixel_sort_core_test.cpp \
  -o /tmp/director_pixel_sort_core_test
/tmp/director_pixel_sort_core_test
```

## SDK gate

The Adobe SDK must be obtained from Adobe's developer distribution and placed
outside this repository. Do not commit SDK headers or binaries. The adapter
will be added and compiled only after that licensed SDK is available; the
portable kernel and all Adobe-neutral contracts are already part of Director.
