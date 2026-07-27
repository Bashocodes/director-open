# Director Adobe Bridge

This package is the Adobe side of Director Open. It consumes a
`.director-adobe.json` handoff produced by Reel Studio, validates that the
packaged local media matches its recorded byte sizes in `media/`, and sends one deterministic
ExtendScript transaction to the configured After Effects MCP server.

It does not replace FFmpeg. FFmpeg remains Director's free/local backend and
continues to work without Adobe.

## Local use

Director's local Vite server is the primary interface. Clicking **Render with
After Effects** writes a temporary unique package under
`~/Library/Caches/Director/Adobe Handoffs`, automatically discovers
`../conductor/conductor.config.json`, and queues the composition through Adobe
MCP. No Chrome folder permission is requested. Override the delivery preset
with `DIRECTOR_OUTPUT_ROOT` or the Adobe preset with
`DIRECTOR_ADOBE_CONFIG`. After the MCP transaction, the local service saves the
project, runs only Director's new queue item through `aerender`, verifies the
output, moves the final movie directly into `~/Movies/Director`, and removes
the successful temporary package. Failed handoffs remain in the cache for
diagnosis or CLI replay. The app's **Show output** button reveals the exact
delivery in Finder.

The CLI can replay a retained package directly:

```sh
pnpm --filter director-adobe build
node packages/director-adobe/dist/cli.js \
  --plan ./My-Reel.director-adobe.json \
  --config /path/to/conductor.config.json
```

The bridge expects an open After Effects project with the Adobe MCP CEP panel
connected. It creates a 32-bpc composition in Director's Rec.2100 HLG working
space, imports the handoff media, rebuilds native transforms, transitions,
grades, effects, text, and text scrims with 32-bpc-aware built-ins, creates the
`Director Beat Map` marker and `Beat Pulse` control when audio is available,
adapts its beat threshold to quiet or loud material, and prefers a ProRes 4444
master. If 4444 is not installed, it uses `IG HDR HLG ProRes` as the Adobe
10-bit intermediate, then applies Conductor's HEVC Main 10 finishing settings
and verifies BT.2020/HLG metadata with ffprobe. The local service runs the long
render through `aerender` after the MCP transaction has closed, so the MCP
socket is not held open. Direct CLI use stops at the verified queued state.

The effect names are owned Director contracts: `director-pixel-sort` and
`director-beat-sync`. Director prefers its native Pixel Sort effect when that
wrapper is installed. Without that adapter, Director prepares Pixel Sort and
the other selected structural effects with the same exact deterministic frame
engine used by preview and FFmpeg export. After Effects receives those plates,
then applies 32-bpc grades, transitions, text, beat controls, composition, and
finishing. Director no longer substitutes Mosaic, Minimax, Directional Blur,
or Turbulent Displace for pixel sorting. If neither a prepared plate nor the
native effect is available, the render fails explicitly. Other effects use
built-in AE translations where possible; the returned receipt distinguishes
exact prepared plates, native equivalents, approximations, unavailable
mappings, and the precision used by each stage. Transition animation is
isolated from camera-motion keyframes so one system cannot overwrite the
other. It never substitutes a paid third-party plugin or silently claims
parity.

Static/hosted builds download the complete package as
`*.director-adobe.zip` into the browser's configured Downloads folder because
they do not have a trusted local process that can write `~/Movies/Director`.
Unzip it before passing the plan to the CLI.

## One-time After Effects setup

For the preferred master, save a QuickTime/Apple ProRes 4444 output-module
template under one of the names in the plan (by default
`Apple ProRes 4444`, `ProRes 4444`, or `Apple ProRes 4444 with Alpha`).
Director can run immediately without that setup when the verified
`IG HDR HLG ProRes` intermediate template from Conductor is present. The
bridge fails and lists installed names only when neither the preferred nor
known intermediate template exists; it never infers a codec from an unknown
custom name.
