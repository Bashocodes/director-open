#!/usr/bin/env node

import { executeAdobePlan } from './runner';

function usage() {
  return [
    'Usage: director-adobe --plan <file.director-adobe.json> --config <conductor.config.json>',
    '',
    'Builds the Director composition in the open After Effects project through',
    'the configured Adobe MCP server and queues the ProRes 4444 output.',
    'FFmpeg remains independent and is not required for this path.',
  ].join('\n');
}

function argument(args: readonly string[], name: string) {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await executeAdobePlan({
    planPath: argument(args, '--plan'),
    configPath: argument(args, '--config'),
    ...(args.includes('--server') ? { serverName: argument(args, '--server') } : {}),
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputPath: result.outputPath,
    receipt: result.receipt,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
  process.exitCode = 1;
});
