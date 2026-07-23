import path from 'node:path';
import { DirectorMcpError } from './errors';

export type DirectorMcpCliOptions = {
  root: string;
};

export const DIRECTOR_MCP_USAGE = [
  'Usage: director-mcp --root <directory>',
  '',
  'Runs the Director Open MCP server over stdio.',
  'Only project JSON files inside <directory> may be read or updated.',
].join('\n');

export function parseDirectorMcpCliArguments(args: readonly string[]): DirectorMcpCliOptions {
  let root: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--root') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new DirectorMcpError('INVALID_ARGUMENT', '--root requires a directory path.');
      }
      root = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--root=')) {
      root = argument.slice('--root='.length);
      continue;
    }
    throw new DirectorMcpError('INVALID_ARGUMENT', `Unknown argument: ${argument}`);
  }

  if (!root?.trim()) {
    throw new DirectorMcpError('INVALID_ARGUMENT', '--root is required.');
  }
  return { root: path.resolve(root) };
}
