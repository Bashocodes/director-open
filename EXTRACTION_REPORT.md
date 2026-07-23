# Extraction report

## Result

Director Open is a fresh, standalone repository extracted from a completed predecessor codebase. The source worktree was clean before extraction and remained clean after all work.

The copied project has a neutral identity, no production route or account identifier, no private service binding, no remote corpus or image proxy, no bundled gallery, and no dependency on the legacy product's services. Its library starts empty and accepts browser-local JPEG, PNG, and WebP uploads.

## Copy boundary

The source contained 113 tracked files. The initial copy contained 112 files because the event compliance checklist was excluded as requested. The copy also excluded:

- `.git/`
- `node_modules/`
- `dist/`
- `.wrangler/`
- `coverage/`, `build/`, `out/`, `.vite/`, `.turbo/`, and `.cache/`
- logs, TypeScript incremental-build files, and macOS metadata
- the event-only compliance checklist

Dependency installation later recreated ignored `node_modules/`. Verification temporarily generated ignored `dist/`, which was removed again before the initial commit.

## Files removed

- The event-only compliance checklist — excluded during the copy.
- The legacy branded-logo component — removed with the branded navigation.
- `src/worker/assets.ts` — removed the synthetic/public corpus adapter and image proxy.
- `src/worker/assets.test.ts` — removed tests for the deleted adapter, service call, and signed image redirect.
- `docs/ASSET_API_CONTRACT.md` — described the deleted asset service.
- `docs/DEMO_SCRIPT.md` — event-specific deployment walkthrough.
- `docs/MAIN_SITE_INTEGRATION.md` — described the deleted production route and private service boundary.
- `src/worker/director.ts` and `src/worker/director.test.ts` — removed with the server-side AI proxy.
- `src/worker/demo.ts` and `src/worker/demo.test.ts` — removed with the retired server fallback.
- `src/lib/api.ts` and `src/lib/api.test.ts` — removed after all chat requests became browser-direct.
- `public/demo/emotion-reference.jpg`
- `public/demo/framing-reference.jpg`
- `public/demo/material-reference.jpg`
- `public/demo/product-upload.jpg`
- `public/demo/storyboard-sprite.jpg`

The five images above were bundled corpus fixtures and became unused when the corpus path was removed.

## Files renamed

- `src/pages/director/components/DirectorSearch.tsx` → `src/pages/director/components/DirectorLibrary.tsx`
- `src/pages/director/components/DirectorSearch.test.tsx` → `src/pages/director/components/DirectorLibrary.test.tsx`

The replacement is a neutral empty-library state with a browser-local image picker. It does not call a Worker asset endpoint.

## Reference and coupling cleanup

### Project identity

- `package.json:2` — package name changed to `director-open`.
- `wrangler.jsonc:3` — Worker name changed to `director-open`.
- `index.html:7-8` — metadata and page title changed to Director Open.
- `src/components/TopNav.tsx:1-14` and `src/styles.css:24-56` — standalone navigation and local-first badge replace the branded logo, production links, search, and profile controls.
- `src/pages/director/components/DirectorChat.tsx:78-84` — neutral Visual Expert label.
- `src/pages/director/reel/DirectorReelStudio.tsx:470`, `ffmpegRenderer.ts:364,382`, `previewEffects.ts:199`, and `project.ts:314` — identity-only output filename, MP4 metadata, diagnostic prefix, and default reel-title changes. Timeline, effects, rendering, and project logic were not altered.
- `tools/render-effect-suite.mjs:410,468`, `tools/render-pixel-sort-video-reference.ts:31`, and `tools/true_pixel_sort_prototype.py:4` — neutral evidence/prototype labels and temporary-directory prefixes.

### Service and deployment isolation

- `wrangler.jsonc` — removed the production zone route, zone identifier, service binding, corpus mode, provider vars, and unused Node compatibility flag. Static `ASSETS` is the only binding.
- `worker-configuration.d.ts` — regenerated from the stripped Wrangler configuration; only `ASSETS` remains.
- `src/worker/env.ts` — reduced to the generated static-assets environment.
- `src/worker/index.ts` — removed all AI, health, asset-search, image-proxy, and upload paths. Every `/api/*` request now returns 404 before the static handler.
- `src/lib/ai/` — browser-direct OpenAI, Anthropic, Google Gemini, and Custom/local adapters now own optional text-only AI calls.

### Browser UI and persistence

- `src/pages/director/components/DirectorLibrary.tsx:1-52` — empty local library and image upload picker.
- `src/pages/director/components/DirectorCanvas.tsx:22-43,175-200` — local library integration and upload-first empty canvas; corpus drag payload handling removed.
- `src/pages/director/DirectorPage.tsx:47-62,140-145,188-251,270-279,384-393,480-566` — upload-created canvas objects, object-URL cleanup, empty retired search context, and no asset result application.
- `src/pages/director/components/DirectorNode.tsx:18-55,91-107` — removed external Decode links while retaining local image view/remove/inheritance controls.
- `src/pages/director/directorActions.ts:1-75` — removed automatic asset placement; the retired search action is a no-op while the other action behaviors remain intact.
- `src/pages/director/types.ts:7-22` — removed the remote asset type and legacy source from application-created canvas objects.
- `src/pages/director/directorPersistence.ts:22-24,28-100,113-120` — standalone storage keys, no persisted search assets, and no legacy remote source in the persisted canvas schema. Reel persistence behavior is otherwise unchanged.

### Documentation

- `README.md` — rewritten for the standalone local-first project.
- `PRIVACY.md` — rewritten around local media, browser-only BYOK provider credentials, direct provider calls, and browser-local persistence.
- `docs/DECISIONS.md` — replaced event/deployment decisions with the standalone architecture boundary.
- `docs/LOCAL_RENDERING.md` — local-upload product contract and neutral integration requirements (renamed from the versioned extraction-era filename during release QA).
- `docs/OPENAI_IMPLEMENTATION.md:1-31` — removed event evidence and remote corpus behavior; retained structured provider and privacy details.
- `THIRD_PARTY_NOTICES.md:11` — licensing-review responsibility assigned to project maintainers.

All event-name, prior-domain, and legacy-brand matches are gone. All hosted-image URLs, private binding names, route/account identifiers, and legacy branding shown to users were removed. The shared canvas-object source discriminator now matches the application and persistence schemas.

## Protected engine and schema boundary

- `src/shared/directorSchemas.ts` retains the existing director action schemas; its unused legacy-branded canvas-source discriminator was removed during the publication sweep.
- Reel changes are limited to the identity strings listed above and corresponding test fixtures/expectations. Timeline compilation, effects, preview, FFmpeg command planning, media validation, and persistence behavior are unchanged.
- Persistence changes are limited to standalone storage identity and removal of deleted search/remote-asset state.

## Test deltas

- Removed `src/worker/assets.test.ts` because every endpoint and service it covered was deleted.
- Renamed and rewrote the search component test as `DirectorLibrary.test.tsx` to cover the local upload state.
- Updated `TopNav.test.tsx` for the standalone identity and absence of external product links.
- Updated `DirectorPage.test.tsx` to cover local uploads, null search context, browser-local recovery, and reel creation from uploaded images.
- Updated `directorActions.test.ts` to verify that the retired search action cannot mutate local canvas state; selection, inheritance, removal, goal, and exclusion coverage remains.
- Removed `demo.test.ts` and `director.test.ts` with the retired server AI implementation.
- Updated `index.test.ts` to verify every Worker API path returns 404 and removed provider-binding coverage.
- Added provider request-shaping, vault, canvas serializer, and action-response parser coverage under `src/lib/ai/`.
- Removed the persisted live-search result test from `directorPersistence.test.ts`; all other recovery, migration, local-media omission, history, and bounds tests remain.
- Updated neutral fixture labels, origins, and expected output names in affected tests.

Current suite: **32 test files passed, 160 tests passed**.

## Secrets hygiene

- No `.env`, `.env.*`, `.dev.vars`, certificate, or private-key file exists in the committed tree.
- No `.dev.vars` or `.dev.vars.example` file is needed; provider settings exist only in browser storage.
- `wrangler.types.vars` is intentionally empty and contains no values.
- High-confidence scans found no provider-key, cloud access-key, Git hosting token, Slack token, JWT, or private-key material.
- A generic assignment scan found only explicit test placeholders; none match real credential formats.
- URL review found only localhost, reserved `.test` origins, public provider endpoints, jsDelivr, and public documentation/source links.
- `wrangler.jsonc` contains no route, zone/account identifier, private URL, or service binding.

## Verification

Commands run:

```text
pnpm install
pnpm worker:types
pnpm verify
```

Results:

- Install: lockfile refreshed after removing the server-side OpenAI SDK; 239 packages installed/reused.
- Worker types: regenerated successfully from the stripped configuration.
- Typecheck: browser and Worker TypeScript projects passed.
- Tests: 32 files passed; 160 tests passed.
- Build: 1,977 modules transformed; production build completed in 853 ms.
- Build emitted one existing advisory that the main minified chunk is larger than 500 kB; it is a warning, not a verification failure.
- Overall `pnpm verify`: **exit 0**.
