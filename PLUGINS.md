# Director Open plugin API

Director Open plugins are trusted, compile-time TypeScript contributions for effects, camera motions, and transitions. They are application code, not sandboxed extensions or modules downloaded at runtime, so review them like any other source contribution. A plugin is a typed object with a stable ID, a Zod parameter schema, UI hints, and the render hooks required by its kind.

The public contract lives in [`src/plugins/types.ts`](./src/plugins/types.ts), registration in [`src/plugins/registry.ts`](./src/plugins/registry.ts), and compatibility implementations in [`src/plugins/legacyAdapter.ts`](./src/plugins/legacyAdapter.ts).

## Add a plugin without editing core files

Create a file anywhere below `src/plugins` whose name ends in `.plugin.ts`, and default-export one plugin. For example, this can be `src/plugins/builtin/gentle-push.plugin.ts`:

```ts
import { z } from 'zod';
import { defineMotionPlugin } from '../types';

const ParamsSchema = z.object({
  distance: z.number().min(0).max(0.25).default(0.14),
});

const gentlePushPlugin = defineMotionPlugin({
  id: 'gentle-push',
  kind: 'motion',
  displayName: 'Gentle push',
  description: 'A centered linear move toward the subject.',
  order: 20,
  params: {
    schema: ParamsSchema,
    ui: {
      distance: {
        control: 'range',
        label: 'Distance',
        min: 0,
        max: 0.25,
        step: 0.01,
      },
    },
  },
  cameraPose({ progress, params }) {
    return { zoom: 1 + params.distance * progress, focusX: 0.5, focusY: 0.5 };
  },
  ffmpegExpressions({ progressFrames, params }) {
    const lastFrame = Math.max(1, Math.round(progressFrames));
    return {
      zoom: `1+${params.distance}*(on/${lastFrame})`,
      focusX: '0.5',
      focusY: '0.5',
    };
  },
});

export default gentlePushPlugin;
```

The registry uses this eager Vite glob:

```ts
import.meta.glob('./**/*.plugin.ts', {
  eager: true,
  import: 'default',
});
```

That means adding the module is enough. Do not add it to the registry, catalogs, select controls, or a central import list. Catalog options are derived from the registry. Nested directories are allowed.

Because discovery is eager, top-level module code runs during application startup, tests, and builds. Keep it side-effect free and browser-safe. Every discovered `.plugin.ts` file must have a valid default export; use ordinary `.ts` files for helpers that are not themselves plugins.

## Shared contract

Use `defineEffectPlugin`, `defineMotionPlugin`, or `defineTransitionPlugin`. These helpers preserve the schema's inferred `z.output` type inside every hook.

Every plugin has:

| Field | Requirement |
| --- | --- |
| `id` | Globally unique lowercase kebab-case matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`. |
| `kind` | `effect`, `motion`, or `transition`. |
| `displayName` | Non-empty human-readable label. |
| `description` | Non-empty concise behavior description. |
| `order` | Finite stable sort key. Equal orders are sorted by `id`, never registration order. |
| `params.schema` | A Zod object that successfully parses `{}`. Give every required parameter a default. |
| `params.ui` | Optional UI hints keyed only by fields that exist in the schema. |
| `hidden` | Keeps direct lookup and saved-project compatibility but omits the plugin from normal choice lists. |
| `deprecated` | Marks a compatibility implementation. It does not by itself hide or disable it. |

IDs share one namespace across all kinds and effect surfaces. Registering the same ID twice throws instead of replacing the first implementation. This includes collisions with plugins exposed by `legacyAdapter.ts`.

The registry validates the fields above and each kind's required hook set at startup:

- A grade requires both `previewCssFilter` and `ffmpegGradeFilter`.
- A non-`none` pre-motion effect requires exactly one `frameTransform`.
- A post-motion effect requires `ffmpegFiltergraph` plus a preview implementation. New plugins use `frameTransform`; only deprecated adapters may use `legacyPreviewCanvas`.
- A motion requires `cameraPose` and `ffmpegExpressions`.
- A transition requires `preview` and `ffmpegTransition`.

### Effects

An effect declares both a surface and a stage:

| Surface and stage | Preview hook | Export hook | Intended use |
| --- | --- | --- | --- |
| `surface: 'visual'`, `stage: 'pre-motion'` | `frameTransform` | The same `frameTransform`; its RGBA results are baked to a PNG sequence before FFmpeg runs | Structural pixel transformations that must happen before camera movement |
| `surface: 'visual'`, `stage: 'post-motion'` | `frameTransform` | `ffmpegFiltergraph` | Optical or temporal processing after camera movement |
| `surface: 'grade'`, `stage: 'grade'` | `previewCssFilter` | `ffmpegGradeFilter` | Color and tone processing after visual effects |

For a new structural effect, prefer `pre-motion` plus one deterministic `frameTransform`. This is the strongest preview/export parity path because both use the same byte algorithm.

A post-motion `frameTransform` is used by the Canvas preview, but it is not baked during export. Its required `ffmpegFiltergraph` supplies the export implementation. The registry rejects a post-motion plugin missing either side, so keep both implementations visually aligned and test both.

A grade's `previewCssFilter` returns a Canvas-compatible filter string such as `contrast(1.05) saturate(0.9)`. Its `ffmpegGradeFilter` returns one inline FFmpeg filter chain without input/output labels. Supply both for preview/export parity.

The `legacyPreviewCanvas` and `legacyPreviewGradeFinish` hooks are internal bridges for copied recipes. New plugins should not depend on them.

Effect metadata also controls the host:

| Field | Host behavior |
| --- | --- |
| `heavy` | Enables the low-quality warning and the longer local-render timeout budget. |
| `textureCritical` | Adds FFmpeg's `-tune grain` when any active visual effect needs texture retention. |
| `preferredUntouchedDuration` | Replaces the default 3.2-second clip duration when the person has not explicitly edited duration. The largest preference in the visual stack wins. |

`frameTransform` receives:

```ts
{
  sourceRgba: Uint8ClampedArray;
  width: number;
  height: number;
  phase: number;
  progress: number;
  seed: number;
  intensity: number;
  frameIndex?: number;
  frameCount?: number;
  baseSeed?: number;
  params: z.output<typeof ParamsSchema>;
}
```

`phase` is the host's clean-hold/reveal/hold/recover envelope, while `progress` is normalized clip progress. `seed` is the deterministic per-frame seed; `baseSeed` is stable for the effect on that clip.

`ffmpegFiltergraph` receives labels and timing:

```ts
{
  inputLabel: string;
  outputLabel: string;
  stageId: string;
  duration: number;
  fps: number;
  intensity: number;
  params: z.output<typeof ParamsSchema>;
}
```

Return an array of complete filtergraph segments. Consume `[inputLabel]`, produce exactly `[outputLabel]`, and derive every internal label from `stageId` so stacked instances cannot collide. The renderer joins returned segments with semicolons.

### Motions

A motion provides both required views of the same camera curve:

- `cameraPose({ progress, params })` returns numeric `zoom`, `focusX`, and `focusY` for preview.
- `ffmpegExpressions({ progressFrames, params })` returns FFmpeg expression strings for the same three values. `progressFrames` is the last zero-based frame denominator, normally `round(duration * fps) - 1`.

Focus coordinates are normalized: `0.5, 0.5` is centered. Keep the preview curve and FFmpeg expression mathematically equivalent. [`push-in.plugin.ts`](./src/plugins/builtin/push-in.plugin.ts) is the reference: both paths use the same smootherstep polynomial and end at `1.14×`.

### Transitions

A transition supplies:

- `preview({ progress, width, height, params })`, returning `opacity`, `translateX`, `translateY`, and `scale`.
- `ffmpegTransition({ params })`, returning an FFmpeg `xfade` transition name such as `fade`, `slideleft`, or `dissolve`.

Optionally, a transition may also supply a **per-pixel** blend:

- `renderFrame({ frameA, frameB, progress, width, height, params }) → Uint8ClampedArray` —
  a pure function of the two clips' composited boundary frames. When present it is the
  single source of truth for both preview and export (the affine `preview`/`ffmpegTransition`
  become fallbacks; see the [Transition engine](./docs/DECISIONS.md) decision). It MUST
  return exactly `frameA` at progress 0 and `frameB` at progress 1, and MUST express every
  spatial quantity as a fraction of the frame so preview (540-wide) and export (1080-wide)
  render the same transition. Optional `previewQuality: 'reduced'` processes the preview at
  half scale and surfaces a "preview simplified — export is full quality" note.

The first clip cannot have an incoming transition. Transition duration remains a clip-level compatibility field, described below.

## Render order and stages

For each clip, the effective pipeline is:

```text
source still
  -> ordered pre-motion RGBA effect stack
  -> camera motion
  -> ordered post-motion FFmpeg/Canvas visual-effect stack
  -> ordered grade stack
  -> caption
  -> timeline transition
```

Pre-motion effects are discovered by `surface: 'visual'`, `stage: 'pre-motion'`, and the presence of `frameTransform`. Their stack is run in project order, with each output becoming the next plugin's input. Export bakes the entire stack into one composite half-output-rate PNG sequence per clip, then applies camera motion once. FFmpeg resamples that sequence to the requested output rate.

Preview uses the same pre-motion stack on a reduced workspace, then applies the camera pose. It normally starts at 75% of preview resolution and drops future frames to 52% if one structural pass takes more than 35 ms. Fixed-size preview and export frames can therefore differ in resolution while still using identical effect math.

Non-structural visual effects run after motion in stack order. Grades run after visual effects, captions run after grades, and transitions combine the finished clips.

## Full walkthrough: `halftone-reveal`

[`halftone-reveal.plugin.ts`](./src/plugins/builtin/halftone-reveal.plugin.ts) is a complete reference structural plugin:

```ts
import { z } from 'zod';
import { defineEffectPlugin } from '../types';

const REFERENCE_WIDTH = 1080;
const ONSET_CELL_PX = 2;
const PEAK_CELL_LOW_PX = 6;
const PEAK_CELL_HIGH_PX = 10;
const INK = 12;
const PAPER = 246;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function mix(low: number, high: number, amount: number) {
  return low + (high - low) * clamp01(amount);
}

function effectStrength(intensity: number) {
  const amount = clamp01(intensity / 100);
  return amount <= 0 ? 0 : Math.pow(amount, 0.45);
}

const ParamsSchema = z.object({
  intensity: z.number().min(0).max(100).default(62),
});

export function halftoneCellSize(width: number, phase: number, intensity: number) {
  const strength = effectStrength(intensity);
  const peakCell = mix(PEAK_CELL_LOW_PX, PEAK_CELL_HIGH_PX, strength);
  const referenceCell = mix(ONSET_CELL_PX, peakCell, clamp01(phase));
  return Math.max(
    1,
    Math.round(referenceCell * Math.max(1, width) / REFERENCE_WIDTH),
  );
}

const halftoneRevealPlugin = defineEffectPlugin({
  id: 'halftone-reveal',
  kind: 'effect',
  surface: 'visual',
  stage: 'pre-motion',
  displayName: 'Halftone reveal',
  description: 'The image resolves into an editorial monochrome dot grid and back.',
  order: 4,
  heavy: true,
  textureCritical: true,
  params: {
    schema: ParamsSchema,
    ui: {
      intensity: {
        control: 'range',
        label: 'Strength',
        min: 0,
        max: 100,
        step: 1,
        suffix: '%',
      },
    },
  },
  frameTransform({ sourceRgba, width, height, phase: rawPhase, params }) {
    if (sourceRgba.length !== width * height * 4) {
      throw new Error('Halftone source dimensions do not match.');
    }

    const phase = clamp01(rawPhase);
    const strength = effectStrength(params.intensity);
    const amount = phase * Math.min(1, strength * 1.08);
    if (amount <= 0 || width <= 0 || height <= 0) return sourceRgba.slice();

    const cellSize = halftoneCellSize(width, phase, params.intensity);
    const sourceAmount = 1 - amount;
    const output = new Uint8ClampedArray(sourceRgba.length);

    for (let cellTop = 0; cellTop < height; cellTop += cellSize) {
      const cellBottom = Math.min(height, cellTop + cellSize);
      for (let cellLeft = 0; cellLeft < width; cellLeft += cellSize) {
        const cellRight = Math.min(width, cellLeft + cellSize);
        let lumaSum = 0;
        let pixelCount = 0;

        for (let y = cellTop; y < cellBottom; y += 1) {
          let offset = (y * width + cellLeft) * 4;
          for (let x = cellLeft; x < cellRight; x += 1) {
            lumaSum += (
              54 * sourceRgba[offset]
              + 183 * sourceRgba[offset + 1]
              + 19 * sourceRgba[offset + 2]
            ) / 256;
            pixelCount += 1;
            offset += 4;
          }
        }

        const darkness = 1 - lumaSum / Math.max(1, pixelCount * 255);
        const radius = cellSize * Math.sqrt(Math.max(0, darkness) / Math.PI);
        const radiusSquared = radius * radius;
        const centerX = cellLeft + cellSize * 0.5;
        const centerY = cellTop + cellSize * 0.5;

        for (let y = cellTop; y < cellBottom; y += 1) {
          const dy = y + 0.5 - centerY;
          let offset = (y * width + cellLeft) * 4;
          for (let x = cellLeft; x < cellRight; x += 1) {
            const dx = x + 0.5 - centerX;
            const tone = dx * dx + dy * dy <= radiusSquared ? INK : PAPER;
            output[offset] = sourceRgba[offset] * sourceAmount + tone * amount;
            output[offset + 1] = sourceRgba[offset + 1] * sourceAmount + tone * amount;
            output[offset + 2] = sourceRgba[offset + 2] * sourceAmount + tone * amount;
            output[offset + 3] = sourceRgba[offset + 3];
            offset += 4;
          }
        }
      }
    }

    return output;
  },
});

export default halftoneRevealPlugin;
```

The important decisions are:

1. The schema is the source of both type inference and the default strength. Parsing `{}` yields `{ intensity: 62 }`.
2. The module is a normal eagerly discovered `.plugin.ts` default export; no catalog or renderer knows its ID in advance.
3. `pre-motion` makes the registry include it in the structural roster and requires `frameTransform`.
4. Cell geometry is defined at a 1080-pixel reference width and scaled to the actual frame, so the pattern has comparable visual density across qualities.
5. The transform checks the RGBA shape, clamps its envelope, returns a copy for a clean frame, never mutates `sourceRgba`, and preserves source alpha.
6. Each cell computes deterministic integer-weighted luma, converts darkness into equal-area dot radius, then mixes ink or paper with the source according to `phase` and intensity.
7. `heavy` gives the render more time and warns before a low-quality render; `textureCritical` asks the final H.264 encode to retain the dot texture.

No FFmpeg implementation is needed for this plugin. Director runs this exact transform for preview and for the frames supplied to FFmpeg.

## Writing a transition: `ripple-dissolve`

[`ripple-dissolve.plugin.ts`](./src/plugins/transitions/ripple-dissolve.plugin.ts) is the
worked example for a per-pixel transition. The steps generalize to any of the seven
cinematic transitions.

1. **Schema with `duration`, `easing`, and fraction-normalized params.** Every spatial
   value (`wavelength`, `amplitude`, `softness`, `originX/Y`) is a fraction, never a pixel
   count, and every default is a non-linear easing curve:

   ```ts
   const ParamsSchema = z.object({
     duration: z.number().min(0.1).max(3).default(0.9),
     easing: z.enum(EASING_CURVES).default('ease-in-out'),
     originX: z.number().min(0).max(1).default(0.5),
     wavelength: z.number().min(0.02).max(0.5).default(0.14),
     amplitude: z.number().min(0).max(0.25).default(0.06),
     // …
   });
   ```

2. **Implement `renderFrame` from first principles.** A radial sine expands from the
   origin; near the moving front the image is displaced along the radius, and a soft
   mixing front carries A into B. Sample both frames with the shared
   `sampleBilinearInto` helper and blend:

   ```ts
   const signed = distNorm - progress;                 // <0 inside front (B), >0 outside (A)
   const mixB = smoothstep(clamp01(0.5 - signed / (2 * softness)));
   const amp = Math.sin((distNorm / wavelength - progress) * 2 * Math.PI)
     * amplitudePx * Math.exp(-(signed * signed) / (2 * softness * softness));
   // sample frameA and frameB at (x + dir*amp, y + dir*amp), then out = mix(A, B, mixB)
   ```

   Return `frameA` at progress 0 and `frameB` at progress 1 (the engine also enforces this).

3. **Keep the affine fallbacks.** Provide a reasonable `preview` (an opacity crossfade)
   and `ffmpegTransition` (`'fade'`). They are never seen when `renderFrame` runs — the
   export overlays the per-pixel PNG sequence over the covered xfade base — but they keep
   the registry contract satisfied and give a graceful degrade.

4. **Save the file under `src/plugins/`** as `*.plugin.ts`. It is auto-discovered — no
   core edits — and immediately appears in the registry-driven picker with a live thumbnail
   and its Zod-generated parameter controls.

5. **Golden + parity test.** Feed synthetic RGBA frames straight into
   `renderTransitionFrame` and fingerprint the output at 0.25/0.5/0.75 (see
   `src/plugins/transitions/transitions.golden.test.ts`). The blend is pure typed-array
   math, so it runs deterministically in jsdom; the canvas boundary compositing is not
   runnable there (document that, like the render goldens).

## Parameters, generated controls, and persistence

The schema owns validation and defaults. The UI object only describes how editable fields should be rendered:

| `control` | Value | UI hint fields |
| --- | --- | --- |
| `range` | number | Required `min`, `max`, and `step`; optional `suffix` |
| `number` | number | Optional `min`, `max`, and `step` |
| `select` | string | Ordered `{ value, label }` options |
| `toggle` | boolean | Label only |

UI hints are partial. A schema field without a hint remains available to code and persistence but has no generated inspector control. A hint for a field absent from the schema is a startup error.

`PluginParamFields` first calls `safePluginParams(plugin, values)`, then renders controls from the hints. Range and number inputs are bounded before `onChange`; the Zod schema remains the final authority at render time. If the supplied object does not parse, `safePluginParams` returns the plugin's complete default object rather than a partially valid object. Design schema migrations accordingly.

Additional values are stored per clip and per stable plugin ID:

```ts
clip.pluginParams = {
  'halftone-reveal': {
    // Future additive halftone fields would live here.
  },
  'gentle-push': {
    distance: 0.18,
  },
};
```

Missing fields acquire schema defaults when the project is rendered, so adding a defaulted parameter is backwards compatible. `pluginParams` is included in project persistence and the render fingerprint; changing a parameter invalidates a previous render result.

Two older shared values intentionally stay in their established fields:

- Visual and grade `intensity` is read from and written to `clip.intensity`.
- Transition `duration` is read from and written to `clip.transitionDuration`.
- All other effect, motion, and transition fields use `clip.pluginParams[pluginId][field]`.

The host merges a legacy value into a plugin's parsed parameters only when that plugin schema declares the matching `intensity` or `duration` field. Unknown stored keys are filtered before parsing, so strict Zod object schemas work. The inspector shows generated custom fields for every active effect layer, plus the motion and incoming transition. The shared visual intensity control remains a single control, preserving the existing interface.

## Determinism and performance rules

Structural plugins are expected to obey these rules:

- Treat `sourceRgba` as immutable and return a `Uint8ClampedArray` of exactly `width * height * 4` bytes.
- Return a new buffer even for a no-op frame. The host also guarantees clean copied endpoint frames when `phase <= 0`, `progress <= 0`, or `progress >= 1`.
- Use only the supplied pixels, dimensions, parameters, timing fields, and seeds. Do not use `Math.random()`, current time, animation timing, DOM state, registration order, or module-level mutable render state.
- Use `seed` for deliberate per-frame variation and `baseSeed` for clip-stable structure. Prefer `frameIndex` and `frameCount` over reconstructing a discrete schedule from floating-point time.
- Clamp externally meaningful progress and strength inputs. Preserve alpha unless changing alpha is the documented effect.
- Keep the synchronous hot path approximately linear in pixel count. Reuse scalar calculations outside inner loops, avoid per-pixel objects and strings, and avoid unnecessary full-frame copies.
- Expect multiple structural plugins to run sequentially. One plugin's output is the next plugin's source, so stack order must be meaningful and deterministic.
- Do not depend on Canvas color conversion inside `frameTransform`. Direct typed-array math keeps the algorithm portable between live preview and sequence export.

Structural effects are sampled at half the requested output frame rate. Export encodes each sampled frame as PNG and yields back to the browser every three frames. `heavy` adjusts host warnings and timeout, but it does not make an unbounded algorithm safe.

FFmpeg hook output must also be deterministic. Use the supplied `duration`, `fps`, and parameter values; use `stageId` for labels; avoid filters whose output varies by thread scheduling or an unseeded random source.

## Stable IDs and legacy compatibility

Plugin IDs are serialized into `effect`, `gradeStack`, `visualEffect`, `visualEffectStack`, `motion`, `transition`, and the keys of `pluginParams`. Treat an ID as permanent public data:

- Do not rename an ID merely to rename its display label.
- Do not reuse an old ID for unrelated behavior.
- Prefer `hidden: true` when an old choice should disappear while saved projects must still load.
- Keep the old ID when moving a recipe out of `legacyAdapter.ts`. Remove the adapter entry and add the new module in the same change so the global registry never has two implementations.

The legacy adapter is the only hardcoded compatibility roster. Its old effects, motions, and transitions remain discoverable by ID and are marked `deprecated`. Hidden legacy grades can still be looked up and rendered for saved projects.

`push-in` demonstrates an implementation migration: it is now a standalone plugin, but it retains the old `push-in` ID. Projects do not need a migration. A new plugin must not claim any remaining adapter ID; the registry will fail on the collision.

Unknown saved selections are normalized to safe compatibility fallbacks: `clean` grade, `none` visual effect, `still` motion, and `crossfade` transition. There is no general alias field in the plugin contract, so preserving the original ID is the reliable compatibility strategy.

## Exact golden-frame fingerprint recipe

Every registered pre-motion `frameTransform` automatically enters `STRUCTURAL_EFFECT_IDS`, including hidden compatibility plugins. The structural golden test therefore forces every structural plugin to have one reviewed fingerprint line.

The fixed fixture is 96×128 RGBA. Its frame and timing inputs are exactly:

```ts
const WIDTH = 96;
const HEIGHT = 128;
const FRAME_INDEX = 48;
const FRAME_COUNT = 96;

const GOLDEN_OPTIONS = {
  phase: 0.84,
  progress: FRAME_INDEX / (FRAME_COUNT - 1),
  seed: 0.42 + FRAME_INDEX * 0.003,
  baseSeed: 0.42,
  frameIndex: FRAME_INDEX,
  frameCount: FRAME_COUNT,
  intensity: 60,
} as const;

function fixtureFrame() {
  const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const horizontalWave = (Math.sin(x * 0.11 + y * 0.019) + 1) * 0.5;
      const verticalDrift = y / (HEIGHT - 1);
      const base = 18 + Math.round(horizontalWave * 142 + verticalDrift * 38);
      pixels[offset] = Math.min(255, base + Math.round(x / WIDTH * 31));
      pixels[offset + 1] = Math.min(255, base + Math.round(verticalDrift * 17));
      pixels[offset + 2] = Math.max(0, base - 14 + Math.round(horizontalWave * 9));
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
```

The fingerprint is 32-bit FNV-1a over every output byte, plus the number of pixels for which any RGBA channel changed:

```ts
function fingerprint(source: Uint8ClampedArray, output: Uint8ClampedArray) {
  let hash = 0x811c9dc5;
  let changedPixels = 0;
  for (let offset = 0; offset < output.length; offset += 4) {
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      hash = Math.imul(hash ^ output[offset + channel], 0x01000193) >>> 0;
      pixelChanged ||= output[offset + channel] !== source[offset + channel];
    }
    if (pixelChanged) changedPixels += 1;
  }
  return `fnv1a=${hash.toString(16).padStart(8, '0')};changed=${changedPixels}`;
}
```

To add or intentionally change a structural plugin:

1. Run only the structural golden:

   ```sh
   pnpm exec vitest run src/pages/director/reel/structuralEffects.golden.test.ts
   ```

2. For a new automatically discovered ID, the test fails because `GOLDEN_FINGERPRINTS[id]` is absent and reports the received fingerprint. For changed math, it reports the old and new values.
3. Review the fixed frame visually and confirm the change is intentional. A hash is a regression signal, not visual approval.
4. Add or update only that plugin's line in `GOLDEN_FINGERPRINTS`. Never refresh unrelated lines in bulk.
5. Run the integrated structural golden, reference-plugin goldens, and registry contract tests together:

   ```sh
   pnpm exec vitest run \
     src/pages/director/reel/structuralEffects.golden.test.ts \
     src/plugins/builtin/referencePlugins.golden.test.ts \
     src/plugins/registry.test.ts
   ```

6. Finish with:

   ```sh
   pnpm verify
   ```

The test copies the fixture before dispatch and asserts that the plugin did not mutate it. The current reviewed halftone result is:

```text
fnv1a=56b43b25;changed=12288
```

The same result is independently asserted in `referencePlugins.golden.test.ts` by directly invoking the registered halftone hook with parsed parameters. That file also fingerprints the `push-in` preview poses and FFmpeg expressions (`49c237e2`), so the two reference plugins cover both the shared-frame and paired-hook extension patterns.
