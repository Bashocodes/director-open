# Director Pixel Sort — native Adobe effect

`director_pixel_sort_core.cpp` is the original float RGBA sorting kernel for
the Director Adobe effect. It is deliberately independent of Adobe headers so
the algorithm can be unit-tested and reused by a future non-Adobe renderer.
It keeps the source and destination in floating point throughout; the Adobe
host is not allowed to insert an 8-bit conversion.

The selector uses a multi-octave coherent brush field, luma/saturation
thresholds, and a precomputed Sobel field. It sorts contiguous intervals into
bounded tears rather than making an independent random decision for every
pixel. Scratch buffers are allocated once per frame and reused across runs.

`DirectorPixelSort.cpp` is the real CPU SmartFX adapter. It advertises
`PF_OutFlag2_FLOAT_COLOR_AWARE`, accepts only the 32-bpc SmartFX render path,
requests the full input frame so sorting cannot change at tile boundaries, and
passes the host's padded ARGB float rows through
`director_pixel_sort_plugin_bridge.cpp` into the RGBA core. There is no 8-bit
fallback.

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

`node packages/director-adobe/scripts/test-native.mjs` also runs an exact
parity test from the repository root. It
uses padded ARGB float rows like After Effects, invokes the same bridge called
by SmartFX, and compares every 32-bit float channel bit-for-bit with a direct
core render.

## Build with Adobe After Effects SDK 25.6

The verified SDK package is Adobe After Effects Plug-in SDK 25.6.61 for macOS,
published September 2025:

- Archive: `AfterEffectsSDK_25.6_61_mac.zip`
- SHA-256: `c6abccd52ae25936b819b78c4fea2858bd161f216f72f75184fe9ec55a49756e`

Keep the licensed SDK outside this repository. After extracting its nested
Zstandard archive, point CMake at the directory that contains `Examples`:

```sh
cmake -S . -B build \
  -DAFTER_EFFECTS_SDK_ROOT=/absolute/path/to/ae25.6_61.64bit.AfterEffectsSDK
cmake --build build --config Release
ctest --test-dir build --output-on-failure
```

On macOS the artifact is:

```text
build/DirectorPixelSort.plugin
```

`.aex` is the Windows After Effects module extension. This macOS SDK build
correctly emits a `.plugin` bundle; a Windows `.aex` must be built and
resource-compiled on Windows with Adobe's matching Windows SDK.

To install for the current macOS user, quit After Effects, copy the bundle to:

```text
~/Library/Application Support/Adobe/Common/Plug-ins/7.0/MediaCore/
```

Then restart After Effects. The effect appears under `Director > Director Pixel
Sort`. The CMake build ad-hoc signs the development bundle; production
distribution still requires an Apple Developer ID signature and notarization.
