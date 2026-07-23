# Extraction report

## Result

Director Open is a fresh, standalone repository extracted from the finished source at commit `6f06cb34a8866965fc64e5d7b1e4824f4493a290`. The source worktree was clean before extraction and remained clean after all work.

The copied project has a neutral identity, no production route or account identifier, no private service binding, no remote corpus or image proxy, no bundled gallery, and no dependency on the legacy product's services. Its library starts empty and accepts browser-local JPEG, PNG, and WebP uploads.

## Copy boundary

The source contained 113 tracked files. The initial copy contained 112 files because the event compliance checklist was excluded as requested. The copy also excluded:

- `.git/`
- `node_modules/`
- `dist/`
- `.wrangler/`
- `coverage/`, `build/`, `out/`, `.vite/`, `.turbo/`, and `.cache/`
- logs, TypeScript incremental-build files, and macOS metadata
- `HACKATHON_COMPLIANCE.md`

Dependency installation later recreated ignored `node_modules/`. Verification temporarily generated ignored `dist/`, which was removed again before the initial commit.

## Files removed

- `HACKATHON_COMPLIANCE.md` — excluded during the copy.
- The legacy branded-logo component — removed with the branded navigation.
- `src/worker/assets.ts` — removed the synthetic/public corpus adapter and image proxy.
- `src/worker/assets.test.ts` — removed tests for the deleted adapter, service call, and signed image redirect.
- `docs/ASSET_API_CONTRACT.md` — described the deleted asset service.
- `docs/DEMO_SCRIPT.md` — event-specific deployment walkthrough.
- `docs/MAIN_SITE_INTEGRATION.md` — described the deleted production route and private service boundary.
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

- `wrangler.jsonc:1-21` — removed the production zone route, zone identifier, service binding, and corpus mode. The remaining bindings are static assets plus the credential-free demo flag.
- `worker-configuration.d.ts:1-18` — regenerated from the stripped Wrangler configuration; only `ASSETS` and `DIRECTOR_DEMO_MODE` remain.
- `src/worker/env.ts:1-9` — removed the private fetcher binding and corpus mode from the Worker environment.
- `src/worker/index.ts:1-100` — removed the private upstream fetcher, production-host guard, asset search route, image proxy route, hosted-image CSP origins, and corpus provenance. Health now reports `local-library`.
- `src/worker/director.ts:12-25,84-126,217-270` — neutral model instructions; search actions are filtered rather than executed; no asset adapter is imported or called; empty-library guidance replaces remote placement claims.
- `src/worker/demo.ts:415-434` — deterministic reference-search behavior now invites local uploads and returns no search action.

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
- `PRIVACY.md` — rewritten around local media, optional server-side provider credentials, and browser-local persistence.
- `docs/DECISIONS.md` — replaced event/deployment decisions with the standalone architecture boundary.
- `docs/DIRECTOR_V2_LOCAL_RENDERING.md:5,92-101` — local-upload product contract and neutral integration requirements.
- `docs/OPENAI_IMPLEMENTATION.md:1-31` — removed event evidence and remote corpus behavior; retained structured provider and privacy details.
- `THIRD_PARTY_NOTICES.md:11` — licensing-review responsibility assigned to project maintainers.

All event-name matches are gone outside this report's historical filename inventory. All production-domain URLs, hosted-image URLs, private binding names, route/account identifiers, and legacy branding shown to users were removed. One legacy source discriminator remains at `src/shared/directorSchemas.ts:355` because the shared action schema was explicitly required to remain unchanged; the application and persistence schemas no longer create or accept that source, so it is not a runtime service coupling.

## Protected engine and schema boundary

- `src/shared/directorSchemas.ts` is byte-for-byte unchanged.
- Reel changes are limited to the identity strings listed above and corresponding test fixtures/expectations. Timeline compilation, effects, preview, FFmpeg command planning, media validation, and persistence behavior are unchanged.
- Persistence changes are limited to standalone storage identity and removal of deleted search/remote-asset state.

## Test deltas

- Removed `src/worker/assets.test.ts` because every endpoint and service it covered was deleted.
- Renamed and rewrote the search component test as `DirectorLibrary.test.tsx` to cover the local upload state.
- Updated `TopNav.test.tsx` for the standalone identity and absence of external product links.
- Updated `DirectorPage.test.tsx` to cover local uploads, null search context, browser-local recovery, and reel creation from uploaded images.
- Updated `directorActions.test.ts` to verify that the retired search action cannot mutate local canvas state; selection, inheritance, removal, goal, and exclusion coverage remains.
- Updated `demo.test.ts` to verify an upload invitation instead of an executable search action.
- Updated `index.test.ts` to verify deleted asset/search endpoints return 404 and removed service-binding coverage.
- Removed the persisted live-search result test from `directorPersistence.test.ts`; all other recovery, migration, local-media omission, history, and bounds tests remain.
- Updated neutral fixture labels, origins, and expected output names in affected tests.

Final suite: **30 test files passed, 181 tests passed**.

## Secrets hygiene

- No `.env`, `.env.*`, `.dev.vars`, certificate, or private-key file exists in the committed tree.
- `.dev.vars.example` contains only the non-secret demo flag and empty provider placeholders.
- `wrangler.types.vars` is intentionally empty and contains no values.
- High-confidence scans found no provider-key, cloud access-key, Git hosting token, Slack token, JWT, or private-key material.
- A generic assignment scan found only explicit test placeholders such as `test-only`, `openai-test`, and `gemini-test`; none match real credential formats.
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

- Install: lockfile unchanged; 239 packages installed/reused.
- Worker types: regenerated successfully from the stripped configuration.
- Typecheck: browser and Worker TypeScript projects passed.
- Tests: 30 files passed; 181 tests passed.
- Build: 1,967 modules transformed; production build completed in 829 ms.
- Build emitted one existing advisory that the main minified chunk is larger than 500 kB; it is a warning, not a verification failure.
- Overall `pnpm verify`: **exit 0**.
