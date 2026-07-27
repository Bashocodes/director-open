import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directorRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const conductorRoot = resolve(
  process.env.CONDUCTOR_REPO ?? resolve(directorRoot, "../conductor"),
);
const targetRoot = resolve(directorRoot, "public/conductor");
const required = process.argv.includes("--required");

async function writePlaceholder() {
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });
  await Promise.all([
    writeFile(resolve(targetRoot, "index.html"), `<!doctype html>
<html lang="en" data-conductor-bundle="placeholder">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conductor</title>
<link rel="stylesheet" href="/conductor/console.css">
</head>
<body>
<nav class="shell-tabs" aria-label="Workspace">
  <a href="/director/">Director</a>
  <a class="active" href="/conductor/" aria-current="page">Conductor</a>
</nav>
<main class="placeholder-shell">
  <section>
    <h1>Conductor console was not bundled in this build</h1>
    <p>Build again with a Conductor checkout beside Director, or set <code>CONDUCTOR_REPO</code> to its path.</p>
  </section>
</main>
</body>
</html>
`, "utf8"),
    writeFile(resolve(targetRoot, "console.css"), `
:root { color-scheme: dark; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0c0d10; color: #e9ecf2; font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.shell-tabs { height: 64px; padding: 0 22px; display: flex; align-items: stretch; border-bottom: 1px solid rgba(255,255,255,.045); background: rgba(7,7,10,.92); }
.shell-tabs a { padding: 0 14px; display: inline-flex; align-items: center; border-bottom: 2px solid transparent; color: rgba(242,239,234,.54); font-size: 13px; text-decoration: none; }
.shell-tabs a.active { color: #a9c9e7; border-bottom-color: #8eabc8; }
.placeholder-shell { min-height: calc(100vh - 64px); display: grid; place-items: center; padding: 32px 22px; }
.placeholder-shell section { width: min(560px, 100%); padding: 22px; border: 1px solid #242832; border-radius: 12px; background: #14161b; }
.placeholder-shell h1 { margin-bottom: 8px; font-size: 18px; }
.placeholder-shell p { color: #a4acbb; }
.placeholder-shell code { color: #e9ecf2; }
`, "utf8"),
  ]);
  process.stdout.write(
    `Conductor checkout not found at ${conductorRoot}; emitted a non-deployable placeholder.\n`,
  );
}

let conductorPackage;
try {
  conductorPackage = JSON.parse(
    await readFile(resolve(conductorRoot, "package.json"), "utf8"),
  );
} catch (error) {
  if ((error instanceof Error && "code" in error && error.code === "ENOENT") && !required) {
    await writePlaceholder();
    process.exit(0);
  }
  throw new Error(
    required
      ? `Production build requires the Conductor repository at ${conductorRoot}. Set CONDUCTOR_REPO to its checkout.`
      : `Could not read Conductor at ${conductorRoot}: ${error instanceof Error ? error.message : String(error)}`,
  );
}

if (conductorPackage.name !== "@conductor-motion/conductor") {
  throw new Error(`Expected the Conductor repository at ${conductorRoot}`);
}

const build = spawnSync("pnpm", ["build:console"], {
  cwd: conductorRoot,
  stdio: "inherit",
});
if (build.status !== 0) {
  throw new Error("Conductor's static console build failed.");
}

const sourceRoot = resolve(conductorRoot, "dist/console");
await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });
await cp(sourceRoot, targetRoot, { recursive: true });
process.stdout.write(`Synced Conductor console: ${targetRoot}\n`);
