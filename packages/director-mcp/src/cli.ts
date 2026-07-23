#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseDirectorMcpCliArguments, DIRECTOR_MCP_USAGE } from './cliArguments';
import { asDirectorMcpError } from './errors';
import { createDirectorMcpServer } from './server';

async function main() {
  const options = parseDirectorMcpCliArguments(process.argv.slice(2));
  const server = await createDirectorMcpServer(options);

  const close = async () => {
    await server.close();
  };
  process.once('SIGINT', () => {
    void close().finally(() => {
      process.exitCode = 0;
    });
  });
  process.once('SIGTERM', () => {
    void close().finally(() => {
      process.exitCode = 0;
    });
  });

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const directorError = asDirectorMcpError(error);
  process.stderr.write(`${directorError.code}: ${directorError.message}\n${DIRECTOR_MCP_USAGE}\n`);
  process.exitCode = 1;
});
