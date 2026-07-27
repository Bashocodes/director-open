import { describe, expect, it, vi } from 'vitest';
import {
  adobeHandoffArchiveName,
  buildDirectorAdobeHandoff,
  DirectorLocalAdobeUnavailableError,
  sendDirectorAdobeHandoffToLocalService,
  writeDirectorAdobeHandoff,
  zipDirectorAdobeHandoff,
  type AdobeDirectoryFileHandle,
  type AdobeDirectoryHandle,
} from './adobeHandoff';
import { unzipSync } from 'fflate';
import type { ReelProject } from './types';

function readBlob(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

function project(image: { imageUrl: string; sourceFile?: File }): ReelProject {
  return {
    id: 'reel-1',
    title: 'Adobe Test',
    aspectRatio: '9:16',
    fps: 30,
    quality: 'high',
    renderBackend: 'after-effects',
    colorDepth: 16,
    clips: [{
      id: 'clip-1',
      objectId: null,
      title: 'Frame',
      ...image,
      duration: 3,
      effect: 'clean',
      visualEffect: 'none',
      transition: 'cut',
      transitionDuration: 0,
      motion: 'still',
      intensity: 50,
      textLayers: [],
    }],
    selectedClipIds: ['clip-1'],
    audio: null,
    renderRequested: false,
  };
}

describe('Director Adobe handoff packaging', () => {
  it('forces the Adobe composition to 32-bpc and includes local File media', () => {
    const sourceFile = new File(['image'], 'frame.png', { type: 'image/png' });
    const handoff = buildDirectorAdobeHandoff(project({
      imageUrl: 'blob:frame',
      sourceFile,
    }));

    expect(handoff.plan.composition.bitsPerChannel).toBe(32);
    expect(handoff.plan.output.bitDepth).toBe(12);
    expect(handoff.media[0]?.data).toBe(sourceFile);
    expect(handoff.totalBytes).toBeGreaterThan(sourceFile.size);
  });

  it('packages browser-generated data images without requiring a File object', () => {
    const handoff = buildDirectorAdobeHandoff(project({
      imageUrl: 'data:image/png;base64,aW1hZ2U=',
    }));

    expect(handoff.media[0]?.data.size).toBe(5);
    expect(handoff.media[0]?.relativePath).toMatch(/\.png$/);
  });

  it('replaces selected-effect source media with an exact prepared plate', () => {
    const sourceFile = new File(['image'], 'frame.png', { type: 'image/png' });
    const reel = project({ imageUrl: 'blob:frame', sourceFile });
    reel.clips[0] = {
      ...reel.clips[0],
      visualEffect: 'pixel-sort',
      visualEffectStack: ['pixel-sort'],
      motion: 'pull-out',
    };
    const plate = new Blob(['exact-effect-video'], { type: 'video/mp4' });
    const handoff = buildDirectorAdobeHandoff(reel, [{
      clipId: 'clip-1',
      data: plate,
    }]);

    expect(handoff.media[0].data).toBe(plate);
    expect(handoff.plan.media[0]).toMatchObject({
      mimeType: 'video/mp4',
      bytes: plate.size,
    });
    expect(handoff.plan.media[0].relativePath).toMatch(/director-effects\.mp4$/);
    expect(handoff.plan.timeline.clips[0]).toMatchObject({
      preparedVisualEffectStack: ['pixel-sort'],
      preparedMotion: true,
    });
  });

  it('writes the plan and renamed media into one selected directory', async () => {
    const sourceFile = new File(['image'], 'private-name.png', { type: 'image/png' });
    const handoff = buildDirectorAdobeHandoff(project({
      imageUrl: 'blob:frame',
      sourceFile,
    }));
    const written = new Map<string, Blob | string>();
    const fileHandle = (path: string): AdobeDirectoryFileHandle => ({
      createWritable: async () => ({
        write: async (data) => { written.set(path, data); },
        close: vi.fn(async () => undefined),
      }),
    });
    const mediaDirectory: AdobeDirectoryHandle = {
      getDirectoryHandle: vi.fn(),
      getFileHandle: async (name) => fileHandle(`media/${name}`),
    };
    const root: AdobeDirectoryHandle = {
      getDirectoryHandle: async () => mediaDirectory,
      getFileHandle: async (name) => fileHandle(name),
    };

    await writeDirectorAdobeHandoff(root, handoff);

    expect(written.has(handoff.planName)).toBe(true);
    expect([...written.keys()]).toContain(handoff.plan.media[0]?.relativePath);
  });

  it('creates one complete ZIP fallback with the exact planned filenames', async () => {
    const sourceFile = new File(['image'], 'private-name.png', { type: 'image/png' });
    const handoff = buildDirectorAdobeHandoff(project({
      imageUrl: 'blob:frame',
      sourceFile,
    }));
    const archive = unzipSync(new Uint8Array(await readBlob(
      await zipDirectorAdobeHandoff(handoff),
    )));

    expect(adobeHandoffArchiveName('Adobe Test')).toBe('Adobe-Test.director-adobe.zip');
    expect(Object.keys(archive).sort()).toEqual([
      handoff.plan.media[0].relativePath,
      handoff.planName,
    ].sort());
    expect(new TextDecoder().decode(archive[handoff.plan.media[0].relativePath])).toBe('image');
  });

  it('sends the complete ZIP to the preset same-origin local Adobe service', async () => {
    const sourceFile = new File(['image'], 'private-name.png', { type: 'image/png' });
    const handoff = buildDirectorAdobeHandoff(project({
      imageUrl: 'blob:frame',
      sourceFile,
    }));
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/zip',
        'x-director-local': '1',
      });
      expect(init?.body).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({
        ok: true,
        packagePath: null,
        planPath: null,
        outputPath: '/Users/test/Movies/Director/Adobe-Test-20260727-120000-adobe.mp4',
        outputBytes: 12_504_225,
        configPath: '/Users/test/Projects/conductor/conductor.config.json',
        adobe: { status: 'rendered', receipt: { status: 'queued' } },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await sendDirectorAdobeHandoffToLocalService(handoff, request);

    expect(request).toHaveBeenCalledOnce();
    expect(String(request.mock.calls[0]?.[0])).toContain('/api/local-adobe/handoff');
    expect(result.adobe.status).toBe('rendered');
  });

  it('identifies a static build so the UI can download without opening a folder picker', async () => {
    const sourceFile = new File(['image'], 'private-name.png', { type: 'image/png' });
    const handoff = buildDirectorAdobeHandoff(project({
      imageUrl: 'blob:frame',
      sourceFile,
    }));

    await expect(sendDirectorAdobeHandoffToLocalService(
      handoff,
      vi.fn(async () => new Response(null, { status: 404 })),
    )).rejects.toBeInstanceOf(DirectorLocalAdobeUnavailableError);
  });
});
