import { describe, expect, it, vi } from 'vitest';
import {
  DirectorLocalOutputUnavailableError,
  revealDirectorLocalOutput,
  saveDirectorLocalOutput,
} from './localOutput';

describe('Director local rendered output service', () => {
  it('saves an FFmpeg MP4 through the same-origin local service', async () => {
    const output = new Blob(['movie'], { type: 'video/mp4' });
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({
        ok: true,
        backend: 'ffmpeg',
        outputPath: '/Users/test/Movies/Director/My-Reel-20260727-120000-ffmpeg.mp4',
        outputBytes: output.size,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(saveDirectorLocalOutput(output, 'My Reel', request)).resolves.toEqual({
      ok: true,
      backend: 'ffmpeg',
      outputPath: '/Users/test/Movies/Director/My-Reel-20260727-120000-ffmpeg.mp4',
      outputBytes: output.size,
    });
    const [input, init] = request.mock.calls[0]!;
    const endpoint = new URL(String(input));
    expect(endpoint.pathname).toMatch(/\/api\/local-output\/save$/);
    expect(endpoint.searchParams.get('title')).toBe('My Reel');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      body: output,
    });
    expect(init?.headers).toMatchObject({
      'content-type': 'video/mp4',
      'x-director-local': '1',
    });
  });

  it('reveals the exact latest output instead of retaining an older backend path', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        outputPath: '/Users/test/Movies/Director/My-Reel-ffmpeg.mp4',
      });
      return new Response(JSON.stringify({
        ok: true,
        revealed: '/Users/test/Movies/Director/My-Reel-ffmpeg.mp4',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await revealDirectorLocalOutput(
      '/Users/test/Movies/Director/My-Reel-ffmpeg.mp4',
      request,
    );

    expect(String(request.mock.calls[0]?.[0])).toContain('/api/local-output/reveal');
  });

  it('keeps browser download as the fallback when the local service is absent', async () => {
    await expect(saveDirectorLocalOutput(
      new Blob(['movie'], { type: 'video/mp4' }),
      'My Reel',
      vi.fn(async () => new Response(null, { status: 404 })),
    )).rejects.toBeInstanceOf(DirectorLocalOutputUnavailableError);
  });
});
