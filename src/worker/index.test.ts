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
  ])('rejects the removed server API at %s', async (path) => {
    const response = await worker.fetch!(new Request(`https://fallback.test${path}`), env());
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('streams static content with isolation, framing, and compatible CSP headers', async () => {
    const bindings = env();
    const response = await worker.fetch!(new Request('https://fallback.test/director'), bindings);
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
