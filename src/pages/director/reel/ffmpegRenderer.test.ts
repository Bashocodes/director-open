import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserFfmpegRenderer, buildFfmpegCommand, isValidMp4, renderTimeoutMs } from './ffmpegRenderer';
import type { ReelProject } from './types';

const ffmpegHarness = vi.hoisted(() => ({
  instances: [] as Array<{
    handlers: Map<string, Set<(event: never) => void>>;
    written: string[];
    deleted: string[];
    terminated: boolean;
    loadStarted: boolean;
  }>,
  execCode: 0,
  detachWrites: false,
  loadGate: null as null | { promise: Promise<void>; resolve: () => void },
  blobIndex: 0,
}));

const structuralEffectHarness = vi.hoisted(() => ({
  retainedInputs: [] as number[][],
  sequenceCalls: [] as Array<{
    effectIds: string[];
    frameCount: number;
    outputFps: number;
    duration: number;
  }>,
}));

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class {
    handlers = new Map<string, Set<(event: never) => void>>();
    written: string[] = [];
    deleted: string[] = [];
    terminated = false;
    loadStarted = false;
    constructor() { ffmpegHarness.instances.push(this); }
    on(name: string, handler: (event: never) => void) {
      const handlers = this.handlers.get(name) || new Set();
      handlers.add(handler);
      this.handlers.set(name, handlers);
    }
    off(name: string, handler: (event: never) => void) { this.handlers.get(name)?.delete(handler); }
    async load() {
      this.loadStarted = true;
      if (ffmpegHarness.loadGate) await ffmpegHarness.loadGate.promise;
      return true;
    }
    async writeFile(name: string, data: Uint8Array) {
      this.written.push(name);
      if (ffmpegHarness.detachWrites) structuredClone(data, { transfer: [data.buffer as ArrayBuffer] });
    }
    async deleteFile(name: string) { this.deleted.push(name); }
    async exec() { return ffmpegHarness.execCode; }
    async readFile() {
      const bytes = new Uint8Array(32);
      bytes.set([0x66, 0x74, 0x79, 0x70], 4);
      return bytes;
    }
    terminate() { this.terminated = true; }
  },
}));

vi.mock('./structuralEffectEngine', () => ({
  makeStructuralEffectFrameSequence: vi.fn(async (options: {
    effectIds: readonly string[];
    bytes: Uint8Array;
    duration: number;
    outputFps: number;
    shouldCancel?: () => boolean;
    onFrame: (frame: {
      bytes: Uint8Array;
      frameIndex: number;
      frameCount: number;
      phase: number;
      effectMs: number;
    }) => void | Promise<void>;
  }) => {
    const { bytes, duration, effectIds, outputFps, shouldCancel, onFrame } = options;
    structuralEffectHarness.retainedInputs.push(Array.from(bytes.slice()));
    const frameRate = outputFps / 2;
    const frameCount = Math.ceil(duration * frameRate);
    structuralEffectHarness.sequenceCalls.push({ effectIds: [...effectIds], frameCount, outputFps, duration });
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (shouldCancel?.()) throw new Error('Render cancelled.');
      await onFrame({
        bytes: new Uint8Array([137, 80, 78, 71, frameIndex]),
        frameIndex,
        frameCount,
        phase: frameIndex / Math.max(1, frameCount - 1),
        effectMs: 5,
      });
    }
    return { frameRate, frameCount, averageEffectMs: 5, maximumEffectMs: 5 };
  }),
}));

const project: ReelProject = {
  id: 'reel-1',
  title: 'Test reel',
  aspectRatio: '9:16',
  fps: 30,
  quality: 'high',
  selectedClipIds: [],
  audio: null,
  renderRequested: false,
  clips: [
    { id: 'a', objectId: 'a', title: 'A', imageUrl: '/a.jpg', duration: 3, effect: 'hdr', visualEffect: 'none', transition: 'cut', transitionDuration: 0, motion: 'push-in', intensity: 70, caption: '' },
    { id: 'b', objectId: 'b', title: 'B', imageUrl: '/b.jpg', duration: 4, effect: 'cinematic', visualEffect: 'none', transition: 'dip-black', transitionDuration: 0.5, motion: 'pull-out', intensity: 60, caption: 'Resolve' },
  ],
};

function localJpeg(bytes: number[]) {
  const data = new Uint8Array(bytes);
  return {
    name: 'frame.jpg',
    type: 'image/jpeg',
    size: data.byteLength,
    lastModified: 7,
    arrayBuffer: async () => data.buffer,
  } as File;
}

describe('FFmpeg reel command compiler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    ffmpegHarness.instances.length = 0;
    ffmpegHarness.execCode = 0;
    ffmpegHarness.detachWrites = false;
    ffmpegHarness.loadGate = null;
    ffmpegHarness.blobIndex = 0;
    structuralEffectHarness.retainedInputs.length = 0;
    structuralEffectHarness.sequenceCalls.length = 0;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-length': '3' },
    })));
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:ffmpeg-core-${++ffmpegHarness.blobIndex}`);
  });
  it('compiles motion, grading, captions, transitions, and high-quality H.264 output', () => {
    const plan = buildFfmpegCommand(project, ['image-0.jpg', 'image-1.jpg'], [null, null], [null, 2], null);
    expect(plan.filterGraph).toContain('zoompan');
    expect(plan.filterGraph).toContain('unsharp');
    expect(plan.filterGraph).toContain('overlay=0:0');
    expect(plan.filterGraph).toContain('xfade=transition=fadeblack:duration=0.5:offset=2.5');
    expect(plan.args).toContain('libx264');
    expect(plan.args.join(' ')).toContain('-preset veryfast -crf 16');
    expect(plan.args).not.toContain('-tune');
    expect(plan.filterGraph).toContain('scale=1276:2266');
    expect(plan.filterGraph).not.toContain('scale=2160:3840');
    expect(plan.filterGraph).toContain('s=1080x1920');
    expect(plan.filterGraph).toContain('trim=end_frame=1');
    expect(plan.filterGraph).toContain('d=90');
    expect(plan.filterGraph).not.toContain(':d=1:');
    expect(plan.duration).toBe(6.5);
  });

  it('adds local music as a looped input and maps AAC audio', () => {
    const plan = buildFfmpegCommand(
      { ...project, quality: 'balanced' },
      ['a.jpg', 'b.jpg'],
      [null, null],
      [null, null],
      2,
    );
    expect(plan.args.join(' ')).toContain('-stream_loop -1 -i music-input');
    expect(plan.args.join(' ')).toContain('-map 2:a:0 -c:a aac');
    expect(plan.args.join(' ')).toContain('-preset veryfast -crf 19');
  });

  it('uses the deliberate CRF floor for every quality tier', () => {
    for (const [quality, expectedCrf] of [
      ['draft', '24'],
      ['balanced', '19'],
      ['high', '16'],
      ['maximum', '12'],
    ] as const) {
      const plan = buildFfmpegCommand({ ...project, quality }, ['a.jpg', 'b.jpg'], [null, null], [null, null], null);
      const crfIndex = plan.args.indexOf('-crf');
      expect(plan.args.slice(crfIndex, crfIndex + 2)).toEqual(['-crf', expectedCrf]);
      expect(plan.args.slice(crfIndex - 2, crfIndex)).toEqual(['-preset', 'veryfast']);
    }
  });

  it('uses the low-compression maximum preset and compiles the expanded grade and motion catalog', () => {
    const expanded = {
      ...project,
      quality: 'maximum' as const,
      clips: [{ ...project.clips[0], effect: 'bleach-bypass' as const, visualEffect: 'pixel-sort' as const, motion: 'drift-down-right' as const }],
    };
    const plan = buildFfmpegCommand(expanded, ['a.jpg'], [1], [null], null);
    expect(plan.args.join(' ')).toContain('-preset veryfast -tune grain -crf 12');
    expect(plan.filterGraph).toContain('s=1080x1920');
    expect(plan.filterGraph).toContain('saturation=');
    expect(plan.filterGraph).toContain('trunc((iw-iw/zoom)*(0.14+0.72*');
    expect(plan.args.join(' ')).toContain('-framerate 15 -start_number 0 -i structural-effect-0-%04d.png');
    expect(plan.filterGraph).toContain('[1:v]fps=30');
    expect(plan.filterGraph).not.toContain('[0:v]trim=end_frame=1');
    expect(plan.filterGraph).not.toContain('blend=all_expr=');
    expect(plan.filterGraph).not.toContain('shufflepixels=');
    expect(plan.filterGraph).not.toContain('avgblur=');
    expect(plan.filterGraph).not.toContain('gt(X,');
    expect(plan.filterGraph).not.toContain('geq=');
    expect(plan.filterGraph).not.toContain('overlay=x=');
    expect(plan.filterGraph).not.toContain('shufflepixels=mode=block');
  });

  it('decodes one half-rate morphology sequence and duplicates it before camera motion', () => {
    const sequenced: ReelProject = {
      ...project,
      fps: 24,
      clips: [{
        ...project.clips[0],
        visualEffect: 'pixel-sort',
        visualEffectStack: ['pixel-sort'],
      }],
    };
    const plan = buildFfmpegCommand(sequenced, ['a.jpg'], [1], [null], null);
    expect(plan.args.join(' ')).toContain('-framerate 12 -start_number 0 -i structural-effect-0-%04d.png');
    expect(plan.args.join(' ').match(/structural-effect-0-%04d\.png/g)).toHaveLength(1);
    expect(plan.filterGraph).toContain('[1:v]fps=24');
    expect(plan.filterGraph.match(/blend=all_expr=/g)).toBeNull();
    expect(plan.filterGraph.match(/scale=1276:2266/g)).toBeNull();
    expect(plan.filterGraph.match(/zoompan=/g)).toHaveLength(1);
    expect(plan.filterGraph).toContain(':d=1:s=1080x1920');
    expect(plan.filterGraph).not.toContain('scale=2160:3840');
    expect(plan.filterGraph).toContain('format=yuv444p[clip-source-0]');
    expect(plan.filterGraph).not.toContain('format=gbrp');
  });

  it('applies motion echo after camera motion with the bundled lagfun filter and a loop-safe envelope', () => {
    const echoProject = {
      ...project,
      fps: 24 as const,
      clips: [{
        ...project.clips[0],
        duration: 6.4,
        visualEffect: 'motion-echo',
        visualEffectStack: ['motion-echo'],
      }],
    } as unknown as ReelProject;
    const plan = buildFfmpegCommand(echoProject, ['a.jpg'], [null], [null], null);
    const zoomIndex = plan.filterGraph.indexOf('zoompan=');
    const echoIndex = plan.filterGraph.indexOf('lagfun=decay=');
    expect(zoomIndex).toBeGreaterThanOrEqual(0);
    expect(echoIndex).toBeGreaterThan(zoomIndex);
    expect(plan.filterGraph).toContain('lagfun=decay=0.945');
    expect(plan.filterGraph).toContain('format=gbrp,split=2');
    expect(plan.filterGraph).toContain("blend=all_expr='A+(");
    expect(plan.filterGraph).toContain('if(lt(N,12),0');
    expect(plan.filterGraph).toContain('if(lt(N,148)');
  });

  it('renders CRT raster lines plus a masked rolling sync band and returns clean at the loop endpoints', () => {
    const crtProject = {
      ...project,
      fps: 24 as const,
      clips: [{
        ...project.clips[0],
        duration: 6.4,
        visualEffect: 'crt-scan',
        visualEffectStack: ['crt-scan'],
      }],
    } as unknown as ReelProject;
    const plan = buildFfmpegCommand(crtProject, ['a.jpg'], [null], [null], null);
    expect(plan.filterGraph).toContain("drawgrid=w=iw:h=4:y='mod(t*65,4)'");
    expect(plan.filterGraph).toContain('rgbashift=rh=1:bh=-1:edge=smear');
    expect(plan.filterGraph).toContain("crop=iw-2:ih:x='1+sin(2*PI*t*7)'");
    expect(plan.filterGraph).toContain('geq=lum=');
    expect(plan.filterGraph).toContain('maskedmerge');
    expect(plan.filterGraph).toContain('/2.5');
    expect(plan.filterGraph).toContain("blend=all_expr='A+(");
    expect(plan.filterGraph).toContain('if(lt(N,12),0');
    expect(plan.filterGraph).toContain('if(lt(N,148)');
  });

  it('uses one composite sequence input for all ordered JS structural plugins', () => {
    const structuralProject: ReelProject = {
      ...project,
      clips: [{
        ...project.clips[0],
        visualEffect: 'pixel-sort',
        visualEffectStack: [
          'pixel-sort',
          'glitch-burst',
          'halftone-reveal',
          'ripple-drift',
          'threshold-melt',
        ],
      }],
    };
    const plan = buildFfmpegCommand(structuralProject, ['a.jpg'], [1], [null], null);
    expect(plan.args.join(' ').match(/structural-effect-0-%04d\.png/g)).toHaveLength(1);
    expect(plan.filterGraph).toContain('[1:v]fps=30');
    expect(plan.filterGraph.match(/zoompan=/g)).toHaveLength(1);
    expect(plan.filterGraph).not.toContain('blend=all_expr=');
  });

  it('preserves texture for raster, halftone, threshold, and pixel-sort exports', () => {
    const textureProject: ReelProject = {
      ...project,
      clips: [{
        ...project.clips[0],
        visualEffect: 'halftone-reveal',
        visualEffectStack: ['halftone-reveal'],
      }],
    };
    const plan = buildFfmpegCommand(textureProject, ['a.jpg'], [1], [null], null);
    expect(plan.args.join(' ')).toContain('-preset veryfast -tune grain -crf 16');
  });

  it('gives premium mask effects a longer local render budget', () => {
    expect(renderTimeoutMs(project)).toBe(162_500);
    expect(renderTimeoutMs({
      ...project,
      clips: [{ ...project.clips[0], visualEffect: 'pixel-sort', visualEffectStack: ['pixel-sort', 'glitch-burst'] }],
    })).toBe(300_000);
  });

  it('renders ordered grade and visual-effect stacks without replacing the underlying frame', () => {
    const stacked: ReelProject = {
      ...project,
      clips: [{
        ...project.clips[0],
        gradeStack: ['hdr', 'warm'],
        visualEffect: 'pixel-sort' as const,
        visualEffectStack: ['pixel-sort', 'crt-scan', 'motion-echo'],
      }],
    };
    const plan = buildFfmpegCommand(stacked, ['a.jpg'], [1], [null], null);
    expect(plan.filterGraph).toContain('unsharp=');
    expect(plan.filterGraph).toContain('colorbalance=');
    expect(plan.filterGraph).toContain('drawgrid=');
    expect(plan.filterGraph).toContain('lagfun=decay=');
    expect(plan.filterGraph).toContain('[1:v]fps=30');
    expect(plan.filterGraph).toContain('format=yuv444p[clip-source-0]');
    expect(plan.filterGraph).not.toContain('pixel-sort-0-0-clean');
    expect(plan.filterGraph).not.toContain('pixel-sort-0-0-sorted');
    expect(plan.filterGraph).not.toContain('shufflepixels=');
    expect(plan.filterGraph).not.toContain('mode=block');
  });

  it('recognizes an MP4 file-type box and rejects incomplete output', () => {
    const valid = new Uint8Array(32);
    valid.set([0x66, 0x74, 0x79, 0x70], 4);
    expect(isValidMp4(valid)).toBe(true);
    expect(isValidMp4(new Uint8Array(31))).toBe(false);
    valid[7] = 0;
    expect(isValidMp4(valid)).toBe(false);
  });

  it('cleans the local engine, input files, output and core blob URLs after success', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const renderer = new BrowserFfmpegRenderer();
    const localProject = {
      ...project,
      clips: [{ ...project.clips[0], imageUrl: 'blob:image', sourceFile: localJpeg([1, 2, 3]) }],
    };
    const blob = await renderer.render(localProject, { onStage: vi.fn(), onProgress: vi.fn() });
    const engine = ffmpegHarness.instances[0];
    expect(blob.type).toBe('video/mp4');
    expect(engine.deleted).toEqual(expect.arrayContaining(['image-0.jpg', 'director-open-reel.mp4']));
    expect(engine.terminated).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(2);
    revoke.mockRestore();
  });

  it('renders an extensionless remote image using its response MIME type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-length': '3', 'content-type': 'image/png' },
    })));
    const remoteProject = {
      ...project,
      quality: 'draft' as const,
      clips: [{ ...project.clips[0], imageUrl: '/director/api/assets/image/extensionless' }],
    };
    await new BrowserFfmpegRenderer().render(remoteProject, { onStage: vi.fn(), onProgress: vi.fn() });
    expect(ffmpegHarness.instances[0].written).toContain('image-0.png');
  });

  it('retains source bytes when ffmpeg transfers and detaches its input buffer', async () => {
    ffmpegHarness.detachWrites = true;
    const renderer = new BrowserFfmpegRenderer();
    const localProject = {
      ...project,
      clips: [{
        ...project.clips[0],
        imageUrl: 'blob:image',
        sourceFile: localJpeg([11, 22, 33, 44]),
        visualEffect: 'pixel-sort' as const,
        visualEffectStack: ['pixel-sort' as const],
      }],
    };
    await renderer.render(localProject, { onStage: vi.fn(), onProgress: vi.fn() });
    expect(structuralEffectHarness.retainedInputs).toEqual([[11, 22, 33, 44]]);
    expect(structuralEffectHarness.sequenceCalls).toEqual([{
      effectIds: ['pixel-sort'],
      frameCount: 45,
      outputFps: 30,
      duration: 3,
    }]);
    expect(ffmpegHarness.instances[0].written).toEqual(expect.arrayContaining([
      'image-0.jpg',
      'structural-effect-0-0000.png',
      'structural-effect-0-0044.png',
    ]));
    expect(ffmpegHarness.instances[0].written.filter((name) => name.startsWith('structural-effect-0-'))).toHaveLength(45);
  });

  it('bakes a multi-plugin JS stack into one composite sequence per clip', async () => {
    const localProject: ReelProject = {
      ...project,
      clips: [{
        ...project.clips[0],
        imageUrl: 'blob:image',
        sourceFile: localJpeg([9, 8, 7]),
        visualEffect: 'pixel-sort',
        visualEffectStack: [
          'pixel-sort',
          'glitch-burst',
          'halftone-reveal',
          'ripple-drift',
          'threshold-melt',
        ],
      }],
    };
    await new BrowserFfmpegRenderer().render(localProject, { onStage: vi.fn(), onProgress: vi.fn() });
    expect(structuralEffectHarness.sequenceCalls).toHaveLength(1);
    expect(structuralEffectHarness.sequenceCalls[0].effectIds).toEqual(localProject.clips[0].visualEffectStack);
    expect(ffmpegHarness.instances[0].written.filter(
      (name) => name.startsWith('structural-effect-0-'),
    )).toHaveLength(45);
  });

  it('cancels between morphology frames before writing the next sequence image', async () => {
    const renderer = new BrowserFfmpegRenderer();
    const localProject = {
      ...project,
      clips: [{
        ...project.clips[0],
        imageUrl: 'blob:image',
        sourceFile: localJpeg([5, 6, 7]),
        visualEffect: 'pixel-sort' as const,
        visualEffectStack: ['pixel-sort' as const],
      }],
    };
    const onStage = vi.fn((_stage: string, message: string) => {
      if (message.includes('frame 1/45')) renderer.cancel();
    });
    await expect(renderer.render(localProject, { onStage, onProgress: vi.fn() })).rejects.toThrow('Render cancelled');
    expect(ffmpegHarness.instances[0].written).toEqual(['image-0.jpg']);
    expect(ffmpegHarness.instances[0].terminated).toBe(true);
  });

  it('cancels during engine loading and permits a clean retry', async () => {
    let resolveLoad: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => { resolveLoad = resolve; });
    ffmpegHarness.loadGate = { promise, resolve: resolveLoad };
    const localProject = {
      ...project,
      clips: [{ ...project.clips[0], imageUrl: 'blob:image', sourceFile: localJpeg([1]) }],
    };
    const renderer = new BrowserFfmpegRenderer();
    const cancelled = renderer.render(localProject, { onStage: vi.fn(), onProgress: vi.fn() });
    await vi.waitFor(() => expect(ffmpegHarness.instances[0]?.loadStarted).toBe(true));
    renderer.cancel();
    resolveLoad();
    await expect(cancelled).rejects.toThrow('Render cancelled');
    expect(ffmpegHarness.instances[0].terminated).toBe(true);

    ffmpegHarness.loadGate = null;
    const retry = await new BrowserFfmpegRenderer().render(localProject, { onStage: vi.fn(), onProgress: vi.fn() });
    expect(retry.type).toBe('video/mp4');
    expect(ffmpegHarness.instances[1].terminated).toBe(true);
  });
});
