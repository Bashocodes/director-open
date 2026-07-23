import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  open,
  realpath,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';
import { MAX_DIRECTOR_PROJECT_JSON_BYTES } from '../../../src/shared/directorProject';
import { DirectorMcpError } from './errors';

export const MAX_PROJECT_FILE_BYTES = MAX_DIRECTOR_PROJECT_JSON_BYTES;

function ioCode(error: unknown) {
  return (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof error.code === 'string'
  ) ? error.code : null;
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === ''
    || (!path.isAbsolute(relative)
      && relative !== '..'
      && !relative.startsWith(`..${path.sep}`));
}

export class RootPathSandbox {
  private constructor(readonly root: string) {}

  static async create(rootInput: string) {
    if (!rootInput.trim() || rootInput.includes('\0')) {
      throw new DirectorMcpError('INVALID_ARGUMENT', '--root must name a directory.');
    }
    let canonicalRoot: string;
    try {
      canonicalRoot = await realpath(path.resolve(rootInput));
    } catch (error) {
      throw new DirectorMcpError(
        'PATH_NOT_FOUND',
        'The configured --root directory does not exist.',
        { filesystemCode: ioCode(error) },
      );
    }
    let rootStats: Awaited<ReturnType<typeof stat>>;
    try {
      rootStats = await stat(canonicalRoot);
    } catch (error) {
      throw new DirectorMcpError(
        'IO_ERROR',
        'The configured --root directory could not be inspected.',
        { filesystemCode: ioCode(error) },
      );
    }
    if (!rootStats.isDirectory()) {
      throw new DirectorMcpError('INVALID_ARGUMENT', '--root must name a directory.');
    }
    return new RootPathSandbox(canonicalRoot);
  }

  private assertInside(candidate: string) {
    if (!isInside(this.root, candidate)) {
      throw new DirectorMcpError(
        'PATH_OUTSIDE_ROOT',
        'The requested project path is outside the configured root.',
      );
    }
  }

  async resolveProjectFile(projectPath: string) {
    if (!projectPath.trim() || projectPath.includes('\0')) {
      throw new DirectorMcpError('INVALID_ARGUMENT', 'Project path must be a non-empty file path.');
    }

    const lexicalPath = path.resolve(this.root, projectPath);
    this.assertInside(lexicalPath);

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(lexicalPath);
    } catch (error) {
      if (ioCode(error) === 'ENOENT') {
        throw new DirectorMcpError('PATH_NOT_FOUND', 'The requested project file does not exist.');
      }
      throw new DirectorMcpError(
        'IO_ERROR',
        'The requested project path could not be resolved.',
        { filesystemCode: ioCode(error) },
      );
    }

    this.assertInside(canonicalPath);
    let fileStats: Awaited<ReturnType<typeof stat>>;
    try {
      fileStats = await stat(canonicalPath);
    } catch (error) {
      throw new DirectorMcpError(
        'IO_ERROR',
        'The requested project file could not be inspected.',
        { filesystemCode: ioCode(error) },
      );
    }
    if (!fileStats.isFile()) {
      throw new DirectorMcpError('PATH_NOT_FILE', 'The requested project path is not a regular file.');
    }
    return { path: canonicalPath, stats: fileStats };
  }

  async readProjectText(projectPath: string) {
    const resolved = await this.resolveProjectFile(projectPath);
    if (resolved.stats.size > MAX_PROJECT_FILE_BYTES) {
      throw new DirectorMcpError(
        'PROJECT_TOO_LARGE',
        `Project files may not exceed ${MAX_PROJECT_FILE_BYTES} bytes.`,
      );
    }

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(
        resolved.path,
        fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
      );
      const openedStats = await handle.stat();
      if (!openedStats.isFile()) {
        throw new DirectorMcpError('PATH_NOT_FILE', 'The requested project path is not a regular file.');
      }
      if (openedStats.size > MAX_PROJECT_FILE_BYTES) {
        throw new DirectorMcpError(
          'PROJECT_TOO_LARGE',
          `Project files may not exceed ${MAX_PROJECT_FILE_BYTES} bytes.`,
        );
      }
      const contents = await handle.readFile();
      if (contents.byteLength > MAX_PROJECT_FILE_BYTES) {
        throw new DirectorMcpError(
          'PROJECT_TOO_LARGE',
          `Project files may not exceed ${MAX_PROJECT_FILE_BYTES} bytes.`,
        );
      }
      return { path: resolved.path, text: contents.toString('utf8') };
    } catch (error) {
      if (error instanceof DirectorMcpError) throw error;
      throw new DirectorMcpError(
        'IO_ERROR',
        'The project file could not be read.',
        { filesystemCode: ioCode(error) },
      );
    } finally {
      await handle?.close();
    }
  }

  async writeProjectText(projectPath: string, text: string) {
    const encodedBytes = Buffer.byteLength(text, 'utf8');
    if (encodedBytes > MAX_PROJECT_FILE_BYTES) {
      throw new DirectorMcpError(
        'PROJECT_TOO_LARGE',
        `Project files may not exceed ${MAX_PROJECT_FILE_BYTES} bytes.`,
      );
    }

    const resolved = await this.resolveProjectFile(projectPath);
    const directory = path.dirname(resolved.path);
    this.assertInside(directory);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(resolved.path)}.${process.pid}-${randomUUID()}.tmp`,
    );
    this.assertInside(temporaryPath);

    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporaryPath, 'wx', resolved.stats.mode & 0o777);
      await handle.writeFile(text, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, resolved.path);
      return resolved.path;
    } catch (error) {
      throw new DirectorMcpError(
        'IO_ERROR',
        'The updated project could not be written atomically.',
        { filesystemCode: ioCode(error) },
      );
    } finally {
      await handle?.close();
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}
