# Director Open browser smoke checklist

Run this checklist before an internal release in the latest stable Chrome and
Safari on macOS. Complete the entire numbered run in Chrome, clear the test
site's data, and then repeat it in Safari. Record the browser versions and every
failure; do not treat a partial run as a pass.

## Preparation

- Start the app from the repository root with `pnpm dev`, then open
  `http://127.0.0.1:5190/director/`.
- Use a dedicated browser profile. Clear storage for `127.0.0.1` before each
  browser run so the first load is genuinely fresh.
- Prepare three small, locally owned JPEG, PNG, or WebP stills with visibly
  different colors. Do not use confidential media.
- Have one valid provider key and a low-cost, currently supported model ready.
  The key is entered only during the chat portion and removed at the end.
- Open developer tools before starting:
  - Chrome: Network, Application > Storage, and Task Manager (`Shift+Esc`).
  - Safari: enable the Develop menu, then open Web Inspector > Network and
    Timelines. Use Storage to inspect Local Storage and IndexedDB.
- In Network, enable **Preserve log**. Do not capture or share screenshots that
  expose authorization headers.

## Numbered run — execute once in Chrome and once in Safari

1. **Load a clean editor.**

   Open `http://127.0.0.1:5190/director/` with site storage cleared.

   Expected: the direction board loads without a console error; the canvas says
   **Build the visual language.**; **LOCAL LIBRARY** says the library starts
   empty; chat shows **Set up an AI provider**; and the persistence ribbon
   settles on **saved locally**.

2. **Read the local-media promise.**

   Click **100% local — your media never leaves this device** in the top
   navigation, read the panel, and close it.

   Expected: **Local media privacy** explains IndexedDB storage, a static-only
   Worker, optional provider-direct text, and the absence of media upload,
   analytics, and telemetry endpoints.

3. **Check the clean-load network boundary.**

   Inspect the Network log before selecting any files.

   Expected: there are no remote image, video, demo-media, analytics, or
   `/api/*` requests. Normal local Vite/app asset requests are allowed. The
   FFmpeg core should not load before a render starts.

4. **Upload three local images.**

   Click **Upload images** in **LOCAL LIBRARY** and choose the three prepared
   stills in one selection.

   Expected: three canvas cards appear and are selected; the context ribbon
   reports `3 canvas objects`; every preview renders; the page stays responsive;
   and the persistence ribbon returns to **saved locally**.

5. **Verify that upload remained local.**

   Filter Network by `Img`, `Media`, `Fetch/XHR`, and each selected filename.
   Inspect the image elements if necessary.

   Expected: previews use browser-local `blob:` URLs. Selecting the files did
   not create a request with image bytes, `multipart/form-data`, or a media MIME
   request body. No request went to the local Worker or a remote media host.

6. **Exercise board editing.**

   Enter a short **PROJECT NORTH STAR**, such as `Quiet momentum through warm
   geometry`. Enter `no flashing, no hard cuts` in **Exclusions, comma
   separated** and press Enter. Drag one card, click **Inherit**, and toggle at
   least two inheritance controls on two different cards.

   Expected: the goal and exclusions remain visible; the moved card stays in
   its new position; active inheritance controls are visibly selected; and
   **saved locally** returns after the changes.

7. **Open Reel Studio from the current selection.**

   Ensure the three image cards are selected, then click **Animate** in the
   bottom dock. If the timeline is empty, click **Use selected canvas (3)**.

   Expected: **Director Reel Studio** opens with **Media stays on this device**,
   three timeline clips, a local preview, and an enabled
   **Render on this device** button.

8. **Arrange and trim the timeline.**

   Select the third clip, click its **Move earlier** control once, then set its
   **Seconds** value to `2.0`. Select the second clip and add the caption
   `LOCAL / HUMAN / DIRECTED`.

   Expected: timeline order visibly changes; the timeline duration updates; the
   edited clip shows `2.0s`; the caption appears in the preview when that clip
   is active; and no clip is duplicated or lost.

9. **Apply three effect treatments, including a migrated plugin.**

   Select the first clip. Set **Color grade** to **Cinematic**. Set
   **Visual effect** to **Halftone reveal**, then use
   **Add visual effect layer** (`+`) to add **Pixel sort**. Move the generated
   **Strength** control away from its default.

   Expected: the effect chips list both visual layers; the preview changes
   without freezing; and the schema-generated **Strength** control updates the
   image. **Halftone reveal** is the reference effect plugin in
   `src/plugins/builtin/halftone-reveal.plugin.ts`.

10. **Exercise migrated motion and a transition.**

    Set **Camera move** to **Push in** on the first clip. Select the second clip
    and set **Transition** to **Crossfade**, with **Blend** at `0.45`.

    Expected: the first preview uses a smooth push-in; the second clip reports
    Crossfade; the transition control is enabled only where a previous clip
    exists; and timeline playback remains coherent.

11. **Confirm AI remains optional.**

    Return to the direction board with **Direction board**.

    Expected: all non-AI editing remains intact, while the composer stays
    disabled and continues to show **AI SETUP NEEDED** until a provider is
    configured.

12. **Configure one real provider key.**

    Click **AI provider settings**, select the provider, confirm or edit its
    model, paste the key, and click **Use _Provider_**. For
    **Custom / local**, also enter the OpenAI-compatible base URL.

    Expected: the key field is password-masked; **Stored** shows only a masked
    value; the composer status changes to `_model_ · browser direct`; and the
    UI states that keys are never sent to the Director Worker.

13. **Request a canvas-aware, gated edit proposal.**

    Send:

    > Propose exactly three edits to the existing reel: keep 24 fps, make the
    > selected clip cinematic with a restrained Push in, and use a Crossfade on
    > the next clip. Explain the changes, but do not apply them.

    Expected: explanation text streams incrementally. When complete, an
    **Apply these edits** card lists validated, human-readable actions with
    **Discard** and **Apply**. The timeline must not change before **Apply** is
    clicked.

14. **Inspect the AI network boundary before applying.**

    Find the provider request in Network.

    Expected: exactly the chosen provider host (or the configured local/custom
    host) receives a text JSON request directly from the browser. The API key
    is in a request header, never the URL. The request contains conversation
    text and a compact project-state description, but no image/audio bytes,
    local filenames, `blob:` URLs, `File` objects, form-data, or Worker URL.

15. **Use the human apply gate.**

    Capture the proposal card for the release record, then click **Apply**.
    Reopen **Animate** if the proposal does not open Reel Studio automatically.

    Expected: the card disappears only after the click; accepted actions appear
    as a receipt; valid edits update the existing reel; and an invalid or stale
    action, if the provider proposed one, is rejected without partially
    corrupting the project.

16. **Prepare a short final export.**

    Use three clips of roughly `1–2s` each, choose **Reel 9:16**, **24 fps**, and
    **High · Recommended**. Keep **Halftone reveal** active so the plugin render
    path is exercised. Do not add confidential audio; optional test audio must
    also be locally owned.

    Expected: the footer reports `1080×1920 · H.264 MP4 · 24 fps`. If a
    low-quality setting is used with a heavy effect, the quality warning is
    precise and offers **Switch to High** or an explicit render-anyway choice.

17. **Render and watch the local lifecycle.**

    Keep Network and the browser process/worker view visible, then click
    **Render on this device**.

    Expected: status advances through engine loading, preparation, frame
    rendering, and verification. The only new remote application-code requests
    allowed are `ffmpeg-core.js` and `ffmpeg-core.wasm` from
    `cdn.jsdelivr.net`; there is no media upload. A temporary FFmpeg worker may
    exist during the job and should terminate when it finishes.

18. **Inspect the MP4 verification report.**

    Wait for **Local MP4 ready.** and expand **Export checks passed**,
    **Export checks need review**, or **Export checks found issues**.

    Expected: the table shows inspected fields, values, source boxes, results,
    and precise messages for duration, resolution, tracks, codec, frames, and
    file size. A warning or failure is informational: **Download MP4** remains
    available.

19. **Download both deliverables.**

    Click **Download report JSON**, then **Download MP4**. Open the MP4 locally
    and inspect the JSON.

    Expected: the MP4 plays at the chosen aspect, contains the expected images,
    motion, effects, transition, and caption, and has approximately the compiled
    duration. The JSON is valid and matches the visible verdict. Neither
    download requires an upload.

20. **Verify refresh restoration.**

    Wait for **saved locally**, note the clip order and settings, then refresh
    the page and allow IndexedDB restoration to finish.

    Expected: the board/reel state, goal, exclusions, actions, timeline,
    captions, effects, plugin parameters, and imported media return. Reel Studio
    reopens if it was open at refresh. There is no “add the files again”
    warning for media saved successfully in IndexedDB, and restored previews use
    fresh local `blob:` URLs.

21. **Verify exported project JSON boundaries.**

    In the chat header, click **Export project JSON**. Confirm the notice, then
    inspect the downloaded JSON as text.

    Expected: the file contains project/timeline/action metadata but no provider
    key, image/audio bytes, data URI, runtime object URL, or absolute local path.
    The notice says private media bytes and AI provider keys were not included.

22. **Run three-export memory smoke.**

    Record the app process memory and active worker count. Render the short reel
    three times; between renders, change the caption (`PASS 1`, `PASS 2`,
    `PASS 3`) so the prior output becomes stale. After each completion, wait
    about 30 seconds before recording memory and workers.

    Expected: each edit invalidates the old download and verify result; each new
    export completes; no FFmpeg worker remains after a job; and the app stays
    responsive. Memory may fluctuate until garbage collection, but it must not
    climb by roughly one full render peak on every cycle. After the third run,
    one current MP4 Blob may remain intentionally; three output Blobs or three
    persistent workers indicate a failure.

    In Chrome, use Task Manager and DevTools Performance monitor. In Safari, use
    Web Inspector Timelines/Memory and worker targets. Record approximate
    before/after values rather than expecting identical numbers.

23. **Remove the test credential.**

    Open **AI provider settings**, choose the tested provider, and click
    **Remove key**. Refresh once.

    Expected: **Stored** no longer shows a key; chat returns to
    **AI SETUP NEEDED**; the editor and restored project continue to work; and
    the namespaced AI-settings localStorage entry contains no test credential.

24. **Record the browser result.**

    Save the browser version, OS version, MP4 dimensions/duration, verify
    verdict, approximate memory observations, and links to any issue reports.
    Mark the browser pass only if every required expected result above passed.

## Release record

| Browser | Version | Steps passed | Verify verdict | Memory after 3 exports | Result | Notes/issues |
| --- | --- | ---: | --- | --- | --- | --- |
| Chrome |  | /24 |  |  | ☐ Pass ☐ Fail |  |
| Safari |  | /24 |  |  | ☐ Pass ☐ Fail |  |

## Stop conditions

Stop the run and file a release-blocking issue if any selected media is sent to
a server, a key appears in a URL/log/project export, project state is corrupted
after an invalid AI proposal, refresh loses media despite a successful local
save, the MP4 cannot be downloaded, or render workers survive repeatedly after
completion.
