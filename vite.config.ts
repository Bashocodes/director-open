import { defineConfig } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';
import react from '@vitejs/plugin-react';
import {
  DIRECTOR_LOCAL_OUTPUT_DIRECTORY,
  persistDirectorAdobeArchive,
  persistDirectorRenderedOutput,
  revealDirectorOutput,
  resolveDirectorAdobeConfig,
} from './packages/director-adobe/src/localHandoff';

const MAX_LOCAL_ADOBE_ARCHIVE_BYTES = 270 * 1_048_576;
const MAX_LOCAL_RENDER_OUTPUT_BYTES = 320 * 1_048_576;

function isLoopbackHost(host: string | undefined) {
  return typeof host === 'string' && /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/i.test(host);
}

function isSameLocalOrigin(value: string | undefined, host: string | undefined) {
  if (!value || value === 'null') return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' && parsed.host.toLowerCase() === host?.toLowerCase();
  } catch {
    return false;
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function readArchive(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_LOCAL_ADOBE_ARCHIVE_BYTES) {
      throw new Error('The Adobe package is larger than Director’s 270 MB local handoff limit.');
    }
    chunks.push(buffer);
  }
  if (bytes === 0) throw new Error('The Adobe package was empty.');
  return new Uint8Array(Buffer.concat(chunks));
}

async function readRenderedOutput(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_LOCAL_RENDER_OUTPUT_BYTES) {
      throw new Error('The rendered MP4 is larger than Director’s 320 MB local-save limit.');
    }
    chunks.push(buffer);
  }
  if (bytes === 0) throw new Error('The rendered MP4 was empty.');
  return new Uint8Array(Buffer.concat(chunks));
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > 16_384) throw new Error('The Director local request was too large.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
}

function directorLocalAdobePlugin() {
  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    const pathname = new URL(request.url ?? '/', 'http://director.local').pathname;
    if (
      !pathname.startsWith('/director/api/local-adobe/')
      && !pathname.startsWith('/director/api/local-output/')
    ) {
      next();
      return;
    }
    void (async () => {
      if (
        !isLoopbackHost(request.headers.host)
        || !isSameLocalOrigin(request.headers.origin, request.headers.host)
        || !isSameLocalOrigin(request.headers.referer, request.headers.host)
      ) {
        sendJson(response, 403, { error: 'Director local output only accepts same-origin loopback requests.' });
        return;
      }
      if (pathname === '/director/api/local-adobe/status' && request.method === 'GET') {
        sendJson(response, 200, {
          ok: true,
          outputRoot: process.env.DIRECTOR_OUTPUT_ROOT ?? DIRECTOR_LOCAL_OUTPUT_DIRECTORY,
          configPath: await resolveDirectorAdobeConfig(),
        });
        return;
      }
      if (
        (
          pathname === '/director/api/local-output/reveal'
          || pathname === '/director/api/local-adobe/reveal'
        )
        && request.method === 'POST'
        && request.headers['x-director-local'] === '1'
        && request.headers['content-type'] === 'application/json'
      ) {
        try {
          const body = await readJsonBody(request) as { outputPath?: unknown };
          if (typeof body.outputPath !== 'string') {
            throw new Error('Director needs an output path to reveal.');
          }
          const revealed = await revealDirectorOutput(body.outputPath);
          sendJson(response, 200, { ok: true, revealed });
        } catch (error) {
          sendJson(response, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
      if (
        pathname === '/director/api/local-output/save'
        && request.method === 'POST'
        && request.headers['x-director-local'] === '1'
        && request.headers['content-type'] === 'video/mp4'
      ) {
        try {
          const title = new URL(request.url ?? '/', 'http://director.local')
            .searchParams.get('title');
          if (!title || title.length > 200) {
            throw new Error('Director needs a valid project title for the output filename.');
          }
          const result = await persistDirectorRenderedOutput(
            await readRenderedOutput(request),
            title,
          );
          sendJson(response, 200, result);
        } catch (error) {
          sendJson(response, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
      if (
        pathname !== '/director/api/local-adobe/handoff'
        || request.method !== 'POST'
        || request.headers['x-director-local'] !== '1'
        || request.headers['content-type'] !== 'application/zip'
      ) {
        sendJson(response, 404, { error: 'Not found.' });
        return;
      }
      try {
        const result = await persistDirectorAdobeArchive(await readArchive(request));
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })().catch((error: unknown) => {
      if (!response.headersSent) {
        sendJson(response, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        response.end();
      }
    });
  };
  return {
    name: 'director-local-adobe-output',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (handler: typeof middleware) => void } }) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: { middlewares: { use: (handler: typeof middleware) => void } }) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  base: '/director/',
  plugins: [react(), directorLocalAdobePlugin()],
  server: {
    host: '127.0.0.1',
    port: 5190,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
