import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  MAX_DIRECTOR_ADOBE_PLAN_JSON_BYTES,
  parseDirectorAdobeRenderPlan,
  type DirectorAdobeRenderPlan,
} from '../../../src/shared/directorAdobeContract';
import { readAdobeMcpServerConfig } from './config';
import { buildDirectorAfterEffectsScript } from './extendScript';
import { withAdobeMcp } from './mcpClient';
import { adobeMcpReceipt } from './mcpResult';

export async function readAdobePlan(planPath: string): Promise<DirectorAdobeRenderPlan> {
  const details = await stat(planPath).catch(() => null);
  if (!details?.isFile()) {
    throw new Error('The selected Director After Effects handoff plan does not exist.');
  }
  if (details.size > MAX_DIRECTOR_ADOBE_PLAN_JSON_BYTES) {
    throw new Error('The selected Director After Effects handoff plan is larger than 5 MB.');
  }
  let value: unknown;
  try {
    value = JSON.parse(await readFile(planPath, 'utf8'));
    return parseDirectorAdobeRenderPlan(value);
  } catch {
    throw new Error('The selected file is not a Director After Effects handoff plan.');
  }
}

async function existingFile(filePath: string, expectedBytes: number) {
  const details = await stat(filePath).catch(() => null);
  if (!details?.isFile()) throw new Error(`Adobe handoff media is missing: ${filePath}`);
  if (details.size !== expectedBytes) {
    throw new Error(
      `Adobe handoff media changed after packaging: ${filePath} (${details.size} bytes; expected ${expectedBytes}).`,
    );
  }
}

async function callScript(client: Client, script: string) {
  const response = await client.callTool({
    name: 'execute_extend_script',
    arguments: { script_string: script },
  }, undefined, { timeout: 60_000 });
  return adobeMcpReceipt(response);
}

export async function executeAdobePlan(options: {
  planPath: string;
  configPath: string;
  serverName?: string;
}) {
  const planPath = path.resolve(options.planPath);
  const plan = await readAdobePlan(planPath);
  const packageRoot = path.dirname(planPath);
  const absoluteMediaPaths: Record<string, string> = {};
  for (const entry of plan.media) {
    if (!entry.available) {
      throw new Error(
        `Adobe handoff media was not packaged: ${entry.originalName}. Export the handoff from Reel Studio before executing it.`,
      );
    }
    const filePath = path.resolve(packageRoot, entry.relativePath);
    if (!filePath.startsWith(`${packageRoot}${path.sep}`)) throw new Error(`Unsafe Adobe handoff path: ${entry.relativePath}`);
    await existingFile(filePath, entry.bytes);
    absoluteMediaPaths[entry.id] = filePath;
  }
  const outputRoot = path.resolve(packageRoot, 'output');
  const outputPath = path.resolve(outputRoot, plan.output.filename);
  if (!outputPath.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`Unsafe Adobe output path: ${plan.output.filename}`);
  }
  await mkdir(outputRoot, { recursive: true });
  const projectRoot = path.resolve(packageRoot, '.director-projects');
  const projectPath = path.resolve(
    projectRoot,
    `${path.basename(plan.output.filename, path.extname(plan.output.filename))}.aep`,
  );
  await mkdir(projectRoot, { recursive: true });
  const script = buildDirectorAfterEffectsScript(
    plan,
    absoluteMediaPaths,
    outputPath,
    projectPath,
  );
  const config = await readAdobeMcpServerConfig(options.configPath, options.serverName);
  const response = await withAdobeMcp(config, (client) => callScript(client, script));
  return { plan, outputPath, response: response.normalized, receipt: response.receipt };
}
