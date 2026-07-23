import { afterEach, describe, expect, it, vi } from 'vitest';

describe('local media module boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not make network calls when media and Worker modules are imported', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();

    await Promise.all([
      import('./DirectorPage'),
      import('./reel/DirectorReelStudio'),
      import('./reel/ReelPreview'),
      import('./reel/ffmpegRenderer'),
    ]);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
