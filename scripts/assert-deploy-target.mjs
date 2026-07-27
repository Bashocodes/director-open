import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expected = {
  accountId: "10caedbcfcc1e6179107cde83789ac60",
  worker: "director-open",
  domain: "director.aikizi.com",
};

function assert(condition, message) {
  if (!condition) throw new Error(`Deployment guard refused: ${message}`);
}

const config = JSON.parse(await readFile(resolve(root, "wrangler.jsonc"), "utf8"));
assert(config.name === expected.worker, `Worker name must be ${expected.worker}.`);
assert(config.account_id === expected.accountId, `account_id must be ${expected.accountId}.`);
assert(config.workers_dev === true, "the existing workers.dev lane must stay enabled.");
assert(config.route === undefined, "a single route entry is not allowed; use only the approved routes array.");
assert(
  Array.isArray(config.routes)
    && config.routes.length === 1
    && config.routes[0]?.pattern === expected.domain
    && config.routes[0]?.custom_domain === true,
  `the only route must be the ${expected.domain} Custom Domain.`,
);

const environmentAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
assert(
  environmentAccount === undefined || environmentAccount === expected.accountId,
  "CLOUDFLARE_ACCOUNT_ID points at a different account.",
);

const whoami = spawnSync("pnpm", ["exec", "wrangler", "whoami"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const whoamiOutput = `${whoami.stdout ?? ""}\n${whoami.stderr ?? ""}`;
assert(whoami.error === undefined, `could not run Wrangler: ${whoami.error?.message ?? "unknown error"}`);
assert(whoami.status === 0, `Wrangler authentication check failed.\n${whoamiOutput.trim()}`);
assert(
  whoamiOutput.includes(expected.accountId),
  `Wrangler is not authenticated to the account pinned by wrangler.jsonc (${expected.accountId}).`,
);

const conductorRoot = resolve(root, "dist/conductor");
const [html, css, javascript, cssStat, javascriptStat] = await Promise.all([
  readFile(resolve(conductorRoot, "index.html"), "utf8"),
  readFile(resolve(conductorRoot, "console.css"), "utf8"),
  readFile(resolve(conductorRoot, "console.js"), "utf8"),
  stat(resolve(conductorRoot, "console.css")),
  stat(resolve(conductorRoot, "console.js")),
]);

assert(!html.includes('data-conductor-bundle="placeholder"'), "the Conductor page is a placeholder.");
assert(!html.includes("Conductor console was not bundled in this build"), "the Conductor page is a placeholder.");
assert(html.includes('<link rel="stylesheet" href="/conductor/console.css">'), "external Conductor CSS is missing.");
assert(html.includes('<script src="/conductor/console.js"></script>'), "external Conductor JavaScript is missing.");
assert(!/<style(?:\s|>)/i.test(html), "the hosted Conductor page contains inline CSS.");
assert(!/<script(?:\s|>)(?![^>]*\bsrc=)/i.test(html), "the hosted Conductor page contains inline JavaScript.");
assert(cssStat.size > 1_000 && css.trim().length > 1_000, "the Conductor stylesheet is empty or incomplete.");
assert(javascriptStat.size > 10_000 && javascript.trim().length > 10_000, "the Conductor script is empty or incomplete.");
assert(javascript.includes('showConnectionState("not-started")'), "the hosted Conductor connection gate is stale.");
assert(javascript.includes('targetAddressSpace: "loopback"'), "the hosted Conductor loopback annotation is missing.");

process.stdout.write(
  `Deployment guard passed: ${expected.worker} may be created or updated in ${expected.accountId}; `
    + `${expected.domain} is its only Custom Domain, and the real Conductor bundle is present.\n`,
);
