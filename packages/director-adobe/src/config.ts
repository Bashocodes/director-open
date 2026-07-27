import { readFile } from 'node:fs/promises';

export type AdobeMcpServerConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type ConductorConfigFile = {
  servers?: Record<string, {
    transport?: string;
    command?: unknown;
    args?: unknown;
    env?: unknown;
  }>;
};

export async function readAdobeMcpServerConfig(
  configPath: string,
  serverName = 'aftereffects',
): Promise<AdobeMcpServerConfig> {
  const parsed = JSON.parse(await readFile(configPath, 'utf8')) as ConductorConfigFile;
  const server = parsed.servers?.[serverName];
  if (!server || server.transport !== 'stdio' || typeof server.command !== 'string') {
    throw new Error(`Config '${configPath}' does not contain a stdio '${serverName}' MCP server.`);
  }
  if (!Array.isArray(server.args) || !server.args.every((value) => typeof value === 'string')) {
    throw new Error(`MCP server '${serverName}' must define a string args array.`);
  }
  const env = server.env === undefined
    ? undefined
    : server.env && typeof server.env === 'object' && !Array.isArray(server.env)
      ? Object.fromEntries(Object.entries(server.env).filter(([, value]) => typeof value === 'string')) as Record<string, string>
      : undefined;
  return { command: server.command, args: server.args, ...(env ? { env } : {}) };
}
