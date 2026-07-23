# Contributing to Director Open

Thank you for helping improve Director Open, a local-first reel studio that
humans and AI agents can both drive.

## Development setup

You will need:

- Node.js 22.12 or newer
- pnpm 11.9
- A modern browser with WebAssembly and IndexedDB support

Clone your fork, then install and start the development servers:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The Vite app runs on `http://localhost:5190` and the local Worker runs on
`http://localhost:8790`.

Useful commands:

```sh
pnpm dev:web       # Vite only
pnpm dev:worker    # local Cloudflare Worker only
pnpm test          # test suite
pnpm typecheck     # application, Worker, and MCP TypeScript checks
pnpm verify        # required typecheck, test, and production-build gate
pnpm --filter director-mcp test   # MCP integration tests only
pnpm --filter director-mcp build  # build the stdio MCP package only
```

To exercise the headless MCP server, first export a project JSON file from the
editor, then run:

```sh
pnpm --filter director-mcp build
node packages/director-mcp/dist/cli.js --root /path/to/director-projects
```

The process speaks MCP over stdin/stdout and intentionally starts no HTTP
listener. See
[`packages/director-mcp/README.md`](packages/director-mcp/README.md) for tool,
client-configuration, and path-safety details.

## Before opening a pull request

Run:

```sh
pnpm verify
```

Every pull request must keep this gate green. Add focused tests for changed
behavior and avoid unrelated formatting or refactoring.

Director Open's privacy boundary is part of its product contract:

- User media must remain in the browser.
- Browser-held provider keys must never be sent to the Director Open Worker,
  included in URLs, or logged.
- The Worker serves the application; it must not proxy or store user media.
- AI-proposed edits must continue through validation and the human Apply gate.

Call out any privacy, persistence, export, or compatibility implications in
the pull request description.

## Plugin contributions

New effects, transitions, and motion presets are a particularly welcome
contribution path. Read [PLUGINS.md](PLUGINS.md) before starting.

A plugin pull request should:

1. Use a stable, unique ID and the typed plugin contract.
2. Provide schema defaults and useful parameter UI hints.
3. Be deterministic for the same inputs and parameters.
4. Include a golden-frame fingerprint test.
5. Avoid modifying core picker or rendering code when registry-based
   registration is sufficient.
6. Preserve existing persisted IDs and rendering behavior.

Use the **New plugin** issue form to propose the plugin and reserve its ID
before investing in a substantial implementation.

## Pull request expectations

- Keep the change bounded and explain the user-visible outcome.
- Link the relevant issue when one exists.
- Include tests or explain why the change needs none.
- Update documentation when a public contract or workflow changes.
- Keep generated files, build output, secrets, account IDs, personal paths,
  and private URLs out of commits.
- Confirm `pnpm verify` passes.
- Accept maintainer feedback and keep the branch current while it is reviewed.

Small pull requests are easier to review. If a proposal changes architecture
or introduces a dependency, open a feature request first so its tradeoffs can
be discussed.

## Reporting security issues

Do not disclose suspected vulnerabilities in a public issue. Follow the
private reporting instructions in [SECURITY.md](SECURITY.md).

## Community standards

Participation in this project is governed by
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
