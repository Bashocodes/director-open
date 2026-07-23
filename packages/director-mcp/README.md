# Director MCP

Director MCP exposes Director Open's typed editing contract to AI agents as a
local, file-based MCP server. It reads and updates the same project JSON format
as the browser editor, while importing the canonical schema, transactional
action engine, timeline compiler, context serializer, and render-plan builder.

Version 1 uses stdio only. It does not start an HTTP server, access the network,
execute FFmpeg, or execute shell commands.

## Tools

| Tool | Purpose | Writes a file |
| --- | --- | --- |
| `describe_schema` | Lists action fields, limits, and allowed enum values. | No |
| `load_project(path)` | Loads and validates a project and makes it the current project. | No |
| `get_project_state` | Returns a compact, token-budgeted view of the current project. | No |
| `validate_actions(actions[])` | Validates proposed actions and reports issues by index. | No |
| `apply_actions(path, actions[])` | Applies a bounded action batch transactionally and returns receipts. | Yes |
| `compile_timeline(path)` | Returns compiled clip starts, overlaps, and total duration. | No |
| `build_render_plan(path)` | Returns FFmpeg arguments and the filtergraph without executing them. | No |

## Build and run locally

Prerequisites: Node.js 22.12 or newer, pnpm 11, and a directory containing
Director project JSON files.

From the repository root:

```sh
pnpm install
pnpm --filter director-mcp build
node packages/director-mcp/dist/cli.js --root ./director-projects
```

`--root` is required. Relative tool paths resolve inside that directory;
absolute tool paths are accepted only when they resolve inside it.

After this package is published to npm, the equivalent one-off command will be:

```sh
npx director-mcp --root ./director-projects
```

The process speaks MCP JSON-RPC on stdin/stdout. Starting it directly in an
interactive terminal therefore appears idle; normally an MCP client launches
it.

## Claude Code

Build the package, create `director-projects/`, then add this project-scoped
`.mcp.json` at the repository root:

```json
{
  "mcpServers": {
    "director-open": {
      "command": "node",
      "args": [
        "packages/director-mcp/dist/cli.js",
        "--root",
        "director-projects"
      ]
    }
  }
}
```

Claude Code asks for approval before enabling a server from project-scoped
configuration. The equivalent CLI command is:

```sh
claude mcp add director-open --scope project -- node packages/director-mcp/dist/cli.js --root director-projects
```

Use `/mcp` or `claude mcp get director-open` to inspect the connection.

## Codex CLI

Codex CLI can read project-scoped MCP configuration from
`.codex/config.toml` in a trusted project:

```toml
[mcp_servers.director_open]
command = "node"
args = [
  "packages/director-mcp/dist/cli.js",
  "--root",
  "director-projects",
]
startup_timeout_sec = 10
tool_timeout_sec = 60
```

Launch Codex from the repository root so those relative paths resolve there.
The equivalent CLI command is:

```sh
codex mcp add director-open -- node packages/director-mcp/dist/cli.js --root director-projects
```

Use `codex mcp list` or `/mcp` in the Codex TUI to inspect the connection.

## Example transcript

The exact prose varies by client; the tool flow and receipts are deterministic.

```text
Human: Load launch-reel.director.json and describe the project.

Agent → describe_schema
Tool  → 2 action families, 8 actions maximum per call, allowed enum values…
Agent → load_project {"path":"launch-reel.director.json"}
Tool  → loaded project "Launch reel", 4 clips, 12.4 seconds
Agent → get_project_state
Tool  → compact canvas, reel, settings, timeline, and recent-action context

Human: Make three edits: use 30 fps, give clips 2 and 3 a crossfade,
and set clip 4 to a push-in.

Agent → validate_actions {"actions":[…3 proposed actions…]}
Tool  → all 3 actions valid
Agent: These edits change project timing and motion. Apply them?
Human: Apply.
Agent → apply_actions {"path":"launch-reel.director.json","actions":[…]}
Tool  → applied: set 30 fps
        applied: crossfade on clips 2 and 3
        applied: push-in on clip 4
        appliedCount: 3, rejectedCount: 0

Agent: All three edits were written. Here are the action receipts…
```

Clients should preserve their normal human confirmation policy for the
write-capable `apply_actions` tool.

## Safety model

- The server canonicalizes `--root` and every requested path with filesystem
  realpaths. `..`, absolute paths outside the root, sibling-prefix tricks, and
  symlinks that resolve outside the root are rejected.
- Only existing regular project files can be read or updated. Project reads are
  size-bounded by the shared Director project schema.
- Action calls share the editor's hard action-count limit. Validation happens
  before mutation, and updates are built in memory before an atomic sibling
  temporary-file rename.
- The package imports the app's project schema, action engine, serializer,
  timeline compiler, and render-plan code. It does not maintain parallel copies
  of those contracts.
- The server has no HTTP transport, network calls, shell execution, subprocess
  execution, or FFmpeg execution. `build_render_plan` returns data only.
- Project media remains on disk. MCP responses contain compact project metadata,
  not imported media bytes.
- Tool errors use stable machine-readable codes and do not expose stack traces.
- Never place secrets in project JSON files or MCP configuration.

The `--root` boundary controls what this server may access; the MCP client still
controls whether and when a model may call a write-capable tool.

## Development

```sh
pnpm --filter director-mcp typecheck
pnpm --filter director-mcp test
pnpm --filter director-mcp build
```

Package tests use the SDK's in-memory client/transport pair, so they exercise
real MCP tool discovery and calls without a network listener or child process.

## License

MIT. See the repository root `LICENSE`.
