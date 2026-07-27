import { describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { WorkerEnv } from './env';

function env() {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response('<!doctype html><html><body>Director</body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })),
    },
  } as unknown as WorkerEnv;
}

describe('standalone Worker boundary', () => {
  it.each([
    '/api/health',
    '/director/api/health',
    '/director/api/director',
    '/director/api/director?source=test',
    '/conductor/api/recipes',
  ])('rejects the removed server API at %s', async (path) => {
    const response = await worker.fetch!(new Request(`https://fallback.test${path}`), env());
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('streams static content with isolation, framing, and compatible CSP headers', async () => {
    const bindings = env();
    const response = await worker.fetch!(new Request('https://fallback.test/director/'), bindings);
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('credentialless');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('content-security-policy')).toContain("worker-src 'self' blob:");
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self' blob:");
    expect(response.headers.get('content-security-policy')).toContain("'wasm-unsafe-eval'");
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'self' blob:");
    expect(response.headers.get('content-security-policy')).toContain('https:');
    expect(response.headers.get('content-security-policy')).toContain('http://127.0.0.1:*');
    expect(response.headers.get('content-security-policy')).toContain('img-src blob: data:');
    expect(response.headers.get('content-security-policy')).toContain('media-src blob:');
    expect(response.headers.get('content-security-policy')).not.toContain("img-src 'self'");
    expect(response.headers.get('content-security-policy')).not.toContain('imagedelivery.net');
    const assetRequest = vi.mocked(bindings.ASSETS.fetch).mock.calls[0]?.[0] as Request;
    expect(new URL(assetRequest.url).pathname).toBe('/');
    await expect(response.text()).resolves.toContain('Director');
  });

  it('strips the Director base path before reading a static asset', async () => {
    const bindings = env();
    await worker.fetch!(new Request('https://fallback.test/director/assets/app.js'), bindings);
    const assetRequest = vi.mocked(bindings.ASSETS.fetch).mock.calls[0]?.[0] as Request;
    expect(new URL(assetRequest.url).pathname).toBe('/assets/app.js');
  });

  it('redirects the root directly to Director with no landing page', async () => {
    const bindings = env();
    const response = await worker.fetch!(new Request('https://shell.example/?from=test'), bindings);
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://shell.example/director/?from=test');
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('serves every Conductor route from its generated static document', async () => {
    const bindings = env();
    const response = await worker.fetch!(new Request('https://shell.example/conductor/project'), bindings);
    const assetRequest = vi.mocked(bindings.ASSETS.fetch).mock.calls[0]?.[0] as Request;
    expect(new URL(assetRequest.url).pathname).toBe('/conductor/index.html');
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(response.headers.get('content-security-policy')).toContain("style-src 'self'");
    expect(response.headers.get('content-security-policy')).not.toContain("'unsafe-inline'");
    expect(response.headers.get('content-security-policy')).toContain('connect-src http://127.0.0.1:4173');
    expect(response.headers.get('content-security-policy')).not.toContain('http://localhost:*');
    expect(response.headers.get('permissions-policy')).toContain('local-network=(self)');
    expect(response.headers.get('permissions-policy')).toContain('loopback-network=(self)');
  });

  it.each(['/conductor/console.css', '/conductor/console.js'])(
    'serves the external Conductor asset at %s without the SPA fallback',
    async (path) => {
      const bindings = env();
      const response = await worker.fetch!(new Request(`https://shell.example${path}`), bindings);
      const assetRequest = vi.mocked(bindings.ASSETS.fetch).mock.calls[0]?.[0] as Request;
      expect(new URL(assetRequest.url).pathname).toBe(path);
      expect(response.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(response.headers.get('content-security-policy')).not.toContain("'unsafe-inline'");
    },
  );

  it('does not serve the SPA shell for unsupported methods', async () => {
    const bindings = env();
    const response = await worker.fetch!(new Request('https://director.test/director/project', { method: 'POST' }), bindings);
    expect(response.status).toBe(405);
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('keeps API responses non-cacheable and out of the static asset handler', async () => {
    const bindings = env();
    const response = await worker.fetch!(new Request('https://fallback.test/api/missing'), bindings);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('does not expose the removed corpus and image proxy endpoints', async () => {
    const bindings = env();
    const search = await worker.fetch!(new Request('https://director.test/director/api/assets/search?q=warrior'), bindings);
    const image = await worker.fetch!(new Request('https://director.test/director/api/assets/image/example'), bindings);

    expect(search.status).toBe(404);
    expect(image.status).toBe(404);
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('has no endpoint that accepts user media', async () => {
    const bindings = env();
    const response = await worker.fetch!(new Request('https://director.test/director/api/media/upload', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array([1, 2, 3]),
    }), bindings);

    expect(response.status).toBe(404);
    expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
