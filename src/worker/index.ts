import type { WorkerEnv } from './env';

const STATIC_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' blob: 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src blob: data:",
  "media-src blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: https: http://localhost:* http://127.0.0.1:*",
  "manifest-src 'self'",
].join('; ');

const CONDUCTOR_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self'",
  'connect-src http://127.0.0.1:4173',
  'img-src data: http://127.0.0.1:4173',
  'media-src http://127.0.0.1:4173',
].join('; ');

const DIRECTOR_BASE_PATH = '/director';

function withoutDirectorBase(pathname: string) {
  if (pathname === DIRECTOR_BASE_PATH || pathname === `${DIRECTOR_BASE_PATH}/`) return '/';
  if (pathname.startsWith(`${DIRECTOR_BASE_PATH}/`)) return pathname.slice(DIRECTOR_BASE_PATH.length);
  return pathname;
}

function isApiPath(pathname: string) {
  return pathname.startsWith('/api/')
    || pathname.startsWith('/director/api/')
    || pathname.startsWith('/conductor/api/');
}

function staticAssetPath(pathname: string) {
  if (pathname === '/conductor/console.css' || pathname === '/conductor/console.js') {
    return pathname;
  }
  if (pathname === '/conductor' || pathname.startsWith('/conductor/')) {
    return '/conductor/index.html';
  }
  return withoutDirectorBase(pathname);
}

function apiJson(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

async function staticAsset(request: Request, env: WorkerEnv) {
  const assetUrl = new URL(request.url);
  const conductor = assetUrl.pathname === '/conductor'
    || assetUrl.pathname.startsWith('/conductor/');
  const assetPath = staticAssetPath(assetUrl.pathname);
  let assetRequest = request;
  if (assetPath !== assetUrl.pathname) {
    assetUrl.pathname = assetPath;
    assetRequest = new Request(assetUrl.toString(), request);
  }
  const asset = await env.ASSETS.fetch(assetRequest);
  const response = new Response(asset.body, asset);
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('cross-origin-embedder-policy', 'credentialless');
  response.headers.set('cross-origin-resource-policy', 'same-origin');
  response.headers.set(
    'permissions-policy',
    'cross-origin-isolated=(self), local-network=(self), loopback-network=(self)',
  );
  response.headers.set(
    'content-security-policy',
    conductor ? CONDUCTOR_CONTENT_SECURITY_POLICY : STATIC_CONTENT_SECURITY_POLICY,
  );
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return response;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/') {
        url.pathname = '/director/';
        return Response.redirect(url.toString(), 308);
      }
      if (url.pathname === '/director' || url.pathname === '/conductor') {
        url.pathname = `${url.pathname}/`;
        return Response.redirect(url.toString(), 308);
      }
      if (isApiPath(url.pathname)) return apiJson({ ok: false, error: 'Not found.' }, 404);
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return apiJson({ ok: false, error: 'Method not allowed.' }, 405);
      }
      return await staticAsset(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'request_failed',
        path: url.pathname,
        message: error instanceof Error ? error.message : 'unknown',
      }));
      return apiJson({ ok: false, error: 'The request could not be completed.' }, 500);
    }
  },
} satisfies ExportedHandler<WorkerEnv>;
