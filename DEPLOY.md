# Director/Conductor deployment lane

Director Open owns the Cloudflare Worker named `director-open`. Its first deployment creates that Worker; later deployments update the same Worker. The committed configuration keeps its `workers.dev` hostname and assigns only `director.aikizi.com` as a Custom Domain. It contains no service binding and must never create a parallel Worker.

The `aikizi.com` apex, `www.aikizi.com`, and the live `aikizi.com/director*` route are outside this deployment lane and must not be edited.

## Prerequisites

- Node.js 22.12.0 or newer
- pnpm 11
- A Cloudflare account with a configured Workers subdomain
- Wrangler authentication for the intended Cloudflare account

Install the locked dependencies:

```bash
pnpm install
```

Wrangler login is a one-time interactive step for a local machine:

```bash
pnpm exec wrangler login
```

Confirm the active account before any real deployment:

```bash
pnpm exec wrangler whoami
```

## Local development

Run the Vite application and local Worker together:

```bash
pnpm dev
```

- Vite: `http://127.0.0.1:5190/director/`
- Local Worker: `http://127.0.0.1:8790`
- The local Worker serves the production build as static assets and has no application API.

The fixed ports allow this project and its predecessor to run at the same time.

## Validate without deploying

Run the complete project verification and a Worker upload dry run:

```bash
pnpm verify
pnpm deploy:dry-run
```

The dry run builds `dist/`, validates `wrangler.jsonc`, bundles the Worker, resolves static assets, and stops without creating a production deployment.

Both deployment commands build first, then run a local deployment guard. The guard pins Worker name `director-open`, account `10caedbcfcc1e6179107cde83789ac60`, and the single `director.aikizi.com` Custom Domain; confirms Wrangler is authenticated to that account; and refuses placeholder or inline Conductor assets. It deliberately does not require deployment history, so the first deployment can create `director-open`.

## Deploy

After deliberately confirming the Cloudflare account and reviewing the dry run:

```bash
pnpm deploy
```

The deployment lands on:

```text
https://director-open.<your-workers-subdomain>.workers.dev/director/
https://director.aikizi.com/director/
```

The Worker redirects `/` to `/director/`. Cloudflare supplies `<your-workers-subdomain>` from the authenticated account.

## Custom domain boundary

The only approved custom hostname is `director.aikizi.com`, attached to the same `director-open` Worker with `custom_domain: true`. Cloudflare owns certificate issuance and the single DNS record for that hostname. Do not add, replace, or edit records for the apex, `www`, or any other `aikizi.com` hostname.

The Conductor process must be started with that exact HTTPS origin. Run this from
your Conductor checkout, which every Conductor user has — the engine spawns MCP
servers and shells out to `ffmpeg`/`aerender`, so it can never be hosted:

```bash
CONDUCTOR_PUBLIC_ORIGIN=https://director.aikizi.com pnpm serve
```

The bare `conductor` binary is not on npm and is not installed globally by
default. Run `pnpm link --global` once inside the Conductor checkout if you want
this form to resolve from any directory:

```bash
CONDUCTOR_PUBLIC_ORIGIN=https://director.aikizi.com conductor serve --no-open
```

Its CORS guard intentionally refuses every other public origin.

Once the engine is listening, the hosted `/conductor/` tab connects on its own —
its failure card watches loopback and latches as soon as `127.0.0.1:4173`
answers, so starting the engine after opening the tab needs no second click.

## Conductor bundle guard

An ordinary `pnpm build` can run in the standalone Director checkout used by CI. If Conductor is unavailable, it writes a conspicuous non-deployable placeholder at `/conductor/` rather than failing.

`pnpm deploy` and `pnpm deploy:dry-run` use `build:production`, which requires a real Conductor checkout beside Director or at `CONDUCTOR_REPO`. They fail before Wrangler runs if only the placeholder could be produced.

## Rollback

To roll back the active Worker to its previous deployed version:

```bash
pnpm exec wrangler rollback
```

You can also inspect prior versions and roll back to a chosen version:

```bash
pnpm exec wrangler versions list
pnpm exec wrangler rollback <VERSION_ID>
```

If the prior source revision is known and preferred, check out that revision locally, run `pnpm verify` and `pnpm deploy:dry-run`, then re-deploy it with `pnpm deploy`.
