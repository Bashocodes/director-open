import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, directorAppUrl } from './api';

afterEach(() => vi.restoreAllMocks());

describe('Director application URLs', () => {
  it('keeps Director API calls under the deployed base path', () => {
    expect(directorAppUrl('/api/health')).toBe('/director/api/health');
    expect(directorAppUrl('/api/director')).toBe('/director/api/director');
    expect(directorAppUrl('/director/api/health')).toBe('/director/api/health');
  });

  it('does not rewrite absolute or protocol-relative URLs', () => {
    expect(directorAppUrl('https://example.com/api')).toBe('https://example.com/api');
    expect(directorAppUrl('//example.com/api')).toBe('//example.com/api');
  });

  it('does not send production-origin credentials to the standalone API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"ok":true}', {
      headers: { 'content-type': 'application/json' },
    }));

    await api.get('/api/health');

    expect(fetchMock).toHaveBeenCalledWith('/director/api/health', expect.objectContaining({ credentials: 'omit' }));
  });
});
