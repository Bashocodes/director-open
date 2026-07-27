import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  directorAerenderArgs,
  directorFinderRevealArgs,
  directorHevcHlgArgs,
  moveDirectorDelivery,
  persistDirectorAdobeArchive,
  persistDirectorRenderedOutput,
  resolveDirectorAdobeConfig,
} from '../src/localHandoff';

const temporaryRoots: string[] = [];

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'director-local-adobe-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

function handoffArchive(title = 'My Reel') {
  const planName = 'My-Reel.director-adobe.json';
  const mediaPath = 'media/clip-01-frame.png';
  const media = strToU8('image');
  const plan = {
    version: 1,
    product: 'director-open',
    backend: 'after-effects',
    projectId: 'project-1',
    title,
    composition: {
      name: 'My-Reel — Director Adobe',
      width: 1080,
      height: 1920,
      pixelAspect: 1,
      frameRate: 30,
      durationSeconds: 3,
      bitsPerChannel: 32,
      workingSpace: 'Rec.2100 HLG Scene W100',
    },
    output: {
      container: 'mov',
      codec: 'prores-4444',
      bitDepth: 12,
      colorSpace: 'Rec.2100 HLG',
      filename: 'My-Reel-director-adobe.mov',
      outputModuleTemplateCandidates: [
        'Apple ProRes 4444',
        'ProRes 4444',
      ],
      fallbackOutputModuleProfiles: [{
        codec: 'prores-422-intermediate',
        bitDepth: 10,
        colorSpace: 'Rec.2100 HLG',
        postProcess: 'hevc-main10-hlg',
        outputModuleTemplateCandidates: ['IG HDR HLG ProRes'],
      }],
    },
    timeline: {
      clips: [{
        clipId: 'clip-1',
        title: 'Frame',
        mediaId: 'clip-media-clip-1',
        startSeconds: 0,
        durationSeconds: 3,
        incomingOverlapSeconds: 0,
        sourceTimeSeconds: 0,
        gradeStack: ['clean'],
        visualEffectStack: ['none'],
        transition: 'cut',
        transitionDurationSeconds: 0,
        motion: 'still',
        intensity: 50,
        pluginParams: {},
        textLayers: [],
      }],
      beats: {
        enabled: false,
        source: 'native-audio-amplitude',
        markerLayerName: 'Director Beat Map',
        threshold: 10,
        riseRatio: 1.12,
        minimumGapSeconds: 0.125,
        pulseDurationSeconds: 0.08,
      },
    },
    media: [{
      id: 'clip-media-clip-1',
      kind: 'clip',
      relativePath: mediaPath,
      originalName: 'frame.png',
      mimeType: 'image/png',
      bytes: media.byteLength,
      available: true,
    }],
    effectContracts: {
      pixelSort: {
        id: 'director-pixel-sort',
        displayName: 'Director Pixel Sort',
        beatAmountParameter: 'Beat Amount',
      },
      beatSync: {
        id: 'director-beat-sync',
        displayName: 'Director Beat Sync',
      },
    },
  };
  return zipSync({
    [planName]: strToU8(`${JSON.stringify(plan)}\n`),
    [mediaPath]: media,
  }, { level: 0 });
}

describe('preset local Director Adobe output', () => {
  it('renders only the exact queue item created by Director', () => {
    expect(directorAerenderArgs('/tmp/director.aep', 7)).toEqual([
      '-project',
      '/tmp/director.aep',
      '-rqindex',
      '7',
    ]);
  });

  it('reveals the finished file in Finder instead of opening it', () => {
    expect(directorFinderRevealArgs('/tmp/director.mp4')).toEqual([
      '-R',
      '/tmp/director.mp4',
    ]);
  });

  it('finishes an Adobe intermediate as tagged HEVC Main 10 HLG', () => {
    const args = directorHevcHlgArgs('/tmp/intermediate.mov', '/tmp/delivery.mp4');
    expect(args).toContain('hevc_videotoolbox');
    expect(args).toContain('main10');
    expect(args).toContain('p010le');
    expect(args).toContain('bt2020nc');
    expect(args).toContain('arib-std-b67');
    expect(args).toContain(
      'hevc_metadata=video_full_range_flag=0:colour_primaries=9:transfer_characteristics=18:matrix_coefficients=9',
    );
  });

  it('writes handoff packages to a private workspace instead of the visible output folder', async () => {
    const root = await temporaryRoot();
    const outputRoot = join(root, 'Movies', 'Director');
    const workspaceRoot = join(root, 'Library', 'Caches', 'Director');
    const now = new Date('2026-07-27T08:15:00.000Z');

    const first = await persistDirectorAdobeArchive(handoffArchive(), {
      outputRoot,
      workspaceRoot,
      execute: false,
      now,
      cwd: root,
    });
    const second = await persistDirectorAdobeArchive(handoffArchive(), {
      outputRoot,
      workspaceRoot,
      execute: false,
      now,
      cwd: root,
    });

    expect(first.packagePath).toBe(join(workspaceRoot, 'My-Reel-20260727-081500'));
    expect(second.packagePath).toBe(join(workspaceRoot, 'My-Reel-20260727-081500-2'));
    expect(first.outputPath).toBe(join(
      first.packagePath!,
      'output',
      'My-Reel-director-adobe.mov',
    ));
    expect(await readFile(join(first.packagePath!, 'media', 'clip-01-frame.png'), 'utf8'))
      .toBe('image');
    expect(first.adobe.status).toBe('not-configured');
  });

  it('moves only the finished movie into the flat Director output folder', async () => {
    const root = await temporaryRoot();
    const workspace = join(root, 'cache', 'handoff', 'output');
    const outputRoot = join(root, 'Movies', 'Director');
    const intermediate = join(workspace, 'intermediate.mp4');
    await mkdir(workspace, { recursive: true });
    await writeFile(intermediate, 'movie');

    const delivery = await moveDirectorDelivery(
      intermediate,
      outputRoot,
      'My Reel',
      new Date('2026-07-27T08:15:00.000Z'),
    );

    expect(delivery).toBe(join(outputRoot, 'My-Reel-20260727-081500-adobe.mp4'));
    await expect(readFile(delivery, 'utf8')).resolves.toBe('movie');
  });

  it('saves FFmpeg outputs beside Adobe outputs without overwriting either render', async () => {
    const root = await temporaryRoot();
    const outputRoot = join(root, 'Movies', 'Director');
    const now = new Date('2026-07-27T08:15:00.000Z');

    const first = await persistDirectorRenderedOutput(
      strToU8('first movie'),
      'My Reel',
      { outputRoot, now },
    );
    const second = await persistDirectorRenderedOutput(
      strToU8('second movie'),
      'My Reel',
      { outputRoot, now },
    );

    expect(first.outputPath).toBe(join(
      outputRoot,
      'My-Reel-20260727-081500-ffmpeg.mp4',
    ));
    expect(second.outputPath).toBe(join(
      outputRoot,
      'My-Reel-20260727-081500-ffmpeg-2.mp4',
    ));
    await expect(readFile(first.outputPath, 'utf8')).resolves.toBe('first movie');
    await expect(readFile(second.outputPath, 'utf8')).resolves.toBe('second movie');
  });

  it('discovers the existing sibling Conductor configuration automatically', async () => {
    const root = await temporaryRoot();
    const director = join(root, 'director-open');
    const config = join(root, 'conductor', 'conductor.config.json');
    await mkdir(join(root, 'conductor'), { recursive: true });
    await writeFile(config, '{}');

    await expect(resolveDirectorAdobeConfig(undefined, director)).resolves.toBe(config);
  });

  it('rejects archive files that are not declared by the validated plan', async () => {
    const root = await temporaryRoot();
    const entries = {
      ...unzipSync(handoffArchive()),
      'unexpected.txt': strToU8('unexpected'),
    };

    await expect(persistDirectorAdobeArchive(zipSync(entries), {
      outputRoot: root,
      execute: false,
    })).rejects.toThrow(/unexpected or missing files/);
  });
});
