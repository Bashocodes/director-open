# Director Open five-minute demo

This scripted tour is designed for a live walkthrough, README recording, or
release screenshots. Its through-line is:

> A local-first reel studio that humans and AI agents can both drive — your
> media never leaves the browser.

The presenter should keep the pace conversational and let the interface provide
the proof. Do not claim that the model sees image pixels: it receives only the
bounded text description of project state.

## Presenter setup

Before recording:

- Run `pnpm dev` and open `http://127.0.0.1:5190/director/` in a clean Chrome
  profile at a desktop viewport.
- Prepare three self-created portrait stills with a coherent palette and
  distinct compositions. Synthetic gradients or patterns work well. Keep them
  small enough for a fast render.
- Have one provider configured with a low-latency model and a valid test key.
  Enter the key off-camera, or start with settings closed and the stored value
  masked. Never expose headers or the full key in a recording.
- Keep a three-clip reel around five seconds total. Use **High · Recommended**
  if the machine can render it comfortably; use a shorter timeline rather than
  lowering quality when showcasing structural effects.
- Run one private render before the take so the FFmpeg runtime is in the browser
  cache. Start the recorded take from a fresh project; caching executable code
  does not upload or retain media.
- Close unrelated tabs, clear notifications, and keep a finished MP4 from the
  same walkthrough available as a timing fallback. If a live render runs long,
  cut to that local file and say it was rendered by the same browser pipeline.

## 0:00–0:30 — Lead with the promise

**On screen**

Open the empty direction board. Click
**100% local — your media never leaves this browser** and leave the privacy
panel open briefly.

**Say**

“Director Open is a local-first reel studio for people and AI agents. Images,
audio, previews, project storage, and the final MP4 stay in this browser. The
Worker serves static files only; there is no media server, account, analytics,
or telemetry.”

**Capture beat**

Frame the empty canvas, local-library state, privacy panel, and disabled AI
setup state together. This is the strongest opening screenshot.

## 0:30–1:10 — Build a direction from private files

**On screen**

Close the privacy panel. Click **Upload images** in **LOCAL LIBRARY** and select
the three prepared stills. Enter:

- **PROJECT NORTH STAR:** `Quiet momentum through warm geometry`
- **Exclusions:** `no flashing, no hard cuts`

Drag one card to show the freeform board. Click **Inherit** and toggle two
channels on different references.

**Say**

“There is no stock-media search here. I bring my own files, arrange the visual
references, and decide what the direction may inherit. These previews are local
Blob URLs, and the project plus media Blobs are saved in IndexedDB.”

**Capture beat**

Pause on the three-card canvas with active inheritance controls and
**saved locally** visible.

## 1:10–2:05 — Edit the reel through the plugin registry

**On screen**

Select the three cards and click **Animate**. In Reel Studio:

1. Move the third clip earlier.
2. Set the selected clip to `2.0` seconds.
3. Choose **Cinematic** under **Color grade**.
4. Choose **Halftone reveal** under **Visual effect**.
5. Add **Pixel sort** with the `+` layer control.
6. Adjust **Strength** and choose **Push in** under **Camera move**.
7. Select the next clip and choose **Crossfade**.

**Say**

“The timeline is editable by hand, and its effect, transition, and motion
pickers read from a typed plugin registry. Halftone reveal and Push in are the
reference plugins: their Zod defaults and UI hints generate these controls, and
the same deterministic hooks feed preview and export. Existing recipes still
work through compatibility adapters.”

**Capture beat**

Pause with the Halftone reveal preview, effect-stack chips, generated
**Strength** control, and timeline in one frame.

## 2:05–3:10 — Let AI propose, never auto-apply

**On screen**

Return to **Direction board**. Briefly open **AI provider settings** so the
masked key, editable model, provider tabs, and browser-only note are visible.
Close settings and send:

> Propose exactly three edits to this reel: keep 24 fps at high quality, give
> the selected clip a restrained cinematic Push in, and use a Crossfade on the
> next clip. Explain the choices, but do not apply them.

Let the explanation stream. When **Apply these edits** appears, pause before
clicking **Apply**.

**Say**

“AI is optional and bring-your-own-key. OpenAI, Anthropic, Gemini, or an
OpenAI-compatible local model is called directly from the browser. The model
gets a compact, token-budgeted description of clips, timing, selection, and
recent actions—not media bytes or filenames.”

“Most importantly, it can only propose typed Director actions. Zod validates
them, the editor explains them in plain language, and nothing changes until I
click Apply.”

Click **Apply**, then reopen **Animate** if necessary.

**Capture beat**

The essential AI screenshot is the unapplied **Apply these edits** card with
both **Discard** and **Apply** visible.

## 3:10–4:25 — Render and inspect the deliverable

**On screen**

Confirm **Reel 9:16**, **High · Recommended**, and **24 fps**. Keep the reel
short and click **Render on this device**. Point out frame progress while it
runs.

**Say**

“The timeline compiles to an FFmpeg plan and FFmpeg.wasm renders H.264 entirely
on this machine. The FFmpeg program is fetched as application code; none of
these image bytes travel with it. Inputs, generated frames, workers, and
temporary files are cleaned after the job.”

When the render completes, expand the export-check result.

**Say**

“A completed render is not assumed to be a valid deliverable. Director parses
the MP4 bytes itself—ISO-BMFF boxes, tracks, codec configuration, resolution,
duration, and frame tables—and compares them with the compiled timeline. This
report is informative, never a download gate.”

Click **Download report JSON**, then point to **Download MP4**.

**Capture beat**

Show **Local MP4 ready.**, the expanded verification table, and
**Download MP4** together. If the verdict is a warning, explain the exact field
rather than hiding it.

## 4:25–5:00 — Close on durable, shared control

**On screen**

Return to the board, wait for **saved locally**, refresh, and show the same
timeline/media restored. Click **Export project JSON** in the chat header.

Optionally cut to a terminal shot that lists the local `director-mcp` tools:
`describe_schema`, `load_project`, `get_project_state`, `validate_actions`,
`apply_actions`, `compile_timeline`, and `build_render_plan`.

**Say**

“Refresh restores the project and imported media from this browser. Project
JSON can move through a file-based workflow without embedding private media or
keys. The same schema, transactional apply engine, timeline compiler, and render
planner are also exposed through a root-confined stdio MCP server—so Claude,
Codex, or a local agent can inspect and edit the file without the browser
running.”

“One contract, three control surfaces: hand editing, human-gated AI, and
headless agents. The media still stays local.”

**Final frame**

Use either the restored reel with **saved locally** or a split composition of
the verified MP4 and MCP tool list. End on the positioning line, not a feature
inventory.

## If the live take goes off script

- **Provider response is invalid:** show the precise “no edits were applied”
  error as proof of the gate, then use a prepared valid take. Never hand-edit a
  model response in DevTools.
- **Render exceeds the time box:** cut to the prepared local MP4 and verify
  report. State clearly that it came from the same client-side render path.
- **A verification warning appears:** read the measured and expected values.
  The non-alarmist report and available download are part of the product story.
- **Media does not restore:** stop the take and file a release-blocking issue;
  do not disguise the failure by selecting the files again.
- **A key or private path becomes visible:** stop recording, revoke the exposed
  credential if necessary, and discard the footage.
