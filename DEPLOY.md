# Isolated deployment lane

Director Open deploys as the Cloudflare Worker named `director-open`. The committed configuration enables only the account's `workers.dev` hostname and contains no custom domain, route, zone, or service binding.

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

## Deploy

After deliberately confirming the Cloudflare account and reviewing the dry run:

```bash
pnpm deploy
```

The deployment lands on:

```text
https://director-open.<your-workers-subdomain>.workers.dev/director/
```

Cloudflare supplies `<your-workers-subdomain>` from the authenticated account. This repository does not configure or infer it.

## Warning: isolated route ownership

**Never add predecessor-owned or private custom-domain routes to this worker from this repository — public route wiring is a separate, deliberate decision.**

Do not add `routes`, custom domains, zone identifiers, or production-domain patterns to `wrangler.jsonc` as part of routine deployment. The Worker name and workers.dev-only configuration are the collision boundary.

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
