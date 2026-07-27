import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js';
import type { AdobeMcpServerConfig } from './config';

export async function withAdobeMcp<T>(
  config: AdobeMcpServerConfig,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: 'director-adobe', version: '0.1.0-alpha.0' });
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...getDefaultEnvironment(), ...config.env },
  });
  try {
    await client.connect(transport);
    return await operation(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}
