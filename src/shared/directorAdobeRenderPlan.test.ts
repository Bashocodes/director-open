import { describe, expect, it } from 'vitest';
import { buildDirectorAdobeRenderPlan, DirectorAdobeRenderPlanError } from './directorAdobeRenderPlan';
import type { ReelProject } from '../pages/director/reel/types';
import { parseDirectorAdobeRenderPlan } from './directorAdobeContract';

function project(): ReelProject {
  const image = new File(['image'], 'source.png', { type: 'image/png' });
  const audio = new File(['audio'], 'score.wav', { type: 'audio/wav' });
  return {
    id: 'reel-1',
    title: 'Test Reel',
    aspectRatio: '9:16',
    fps: 30,
    quality: 'high',
    renderBackend: 'after-effects',
    colorDepth: 32,
    clips: [{
      id: 'clip-1', objectId: null, title: 'Source', imageUrl: 'blob:source', sourceFile: image,
      duration: 3, effect: 'clean', visualEffect: 'pixel-sort', transition: 'cut',
      transitionDuration: 0, motion: 'still', intensity: 80, textLayers: [],
    }],
    selectedClipIds: ['clip-1'],
    audio: { name: audio.name, url: 'blob:audio', sourceFile: audio },
    renderRequested: false,
  };
}

describe('Director Adobe render plan', () => {
  it('preserves the Director timeline and requests 32-bpc HLG working space', () => {
    const plan = buildDirectorAdobeRenderPlan(project());
    expect(plan.backend).toBe('after-effects');
    expect(plan.composition).toMatchObject({
      bitsPerChannel: 32,
      workingSpace: 'Rec.2100 HLG Scene W100',
      frameRate: 30,
    });
    expect(plan.timeline.clips[0]).toMatchObject({
      clipId: 'clip-1',
      visualEffectStack: ['pixel-sort'],
      motion: 'still',
    });
    expect(plan.media.map((entry) => entry.kind)).toEqual(['clip', 'audio']);
    expect(plan.media.every((entry) => entry.available)).toBe(true);
    expect(plan.timeline.beats.enabled).toBe(true);
    expect(plan.timeline.beats.minimumGapSeconds).toBe(0.125);
    expect(plan.output).toMatchObject({ codec: 'prores-4444', bitDepth: 12 });
    expect(plan.output.fallbackOutputModuleProfiles).toEqual([{
      codec: 'prores-422-intermediate',
      bitDepth: 10,
      colorSpace: 'Rec.2100 HLG',
      postProcess: 'hevc-main10-hlg',
      outputModuleTemplateCandidates: ['IG HDR HLG ProRes'],
    }]);
    expect(plan.effectContracts.pixelSort.id).toBe('director-pixel-sort');
  });

  it('refuses a headless reel whose local media was intentionally omitted', () => {
    const value = project();
    delete value.clips[0].sourceFile;
    expect(() => buildDirectorAdobeRenderPlan(value)).toThrowError(DirectorAdobeRenderPlanError);
    expect(() => buildDirectorAdobeRenderPlan(value)).toThrow(/no local source file/i);
  });

  it('builds an explicit unavailable-media plan for MCP inspection only', () => {
    const value = project();
    value.audio = null;
    delete value.clips[0].sourceFile;
    value.clips[0].imageUrl = 'https://example.test/private-image';

    const plan = buildDirectorAdobeRenderPlan(value, { allowMissingMedia: true });

    expect(plan.media[0]).toMatchObject({
      available: false,
      bytes: 0,
      relativePath: 'media/clip-01-Source.media',
    });
    expect(plan.composition.bitsPerChannel).toBe(32);
  });

  it('accepts a generated data image and preserves its exact byte count', () => {
    const value = project();
    value.audio = null;
    delete value.clips[0].sourceFile;
    value.clips[0].imageUrl = 'data:image/png;base64,aW1hZ2U=';

    expect(buildDirectorAdobeRenderPlan(value).media[0]).toMatchObject({
      available: true,
      bytes: 5,
      mimeType: 'image/png',
    });
  });

  it('rejects downgraded colour precision and unsafe package paths', () => {
    const plan = buildDirectorAdobeRenderPlan(project());
    expect(() => parseDirectorAdobeRenderPlan({
      ...plan,
      composition: { ...plan.composition, bitsPerChannel: 16 },
    })).toThrow();
    expect(() => parseDirectorAdobeRenderPlan({
      ...plan,
      media: [{ ...plan.media[0], relativePath: '../source.png' }, ...plan.media.slice(1)],
    })).toThrow();
    expect(() => parseDirectorAdobeRenderPlan({
      ...plan,
      output: { ...plan.output, filename: '../escaped.mov' },
    })).toThrow();
    expect(() => parseDirectorAdobeRenderPlan({
      ...plan,
      media: [plan.media[0], { ...plan.media[1], id: plan.media[0].id }],
    })).toThrow();
    expect(() => parseDirectorAdobeRenderPlan({
      ...plan,
      composition: { ...plan.composition, durationSeconds: 91 },
    })).toThrow();
    expect(() => parseDirectorAdobeRenderPlan({
      ...plan,
      timeline: {
        ...plan.timeline,
        clips: [plan.timeline.clips[0], plan.timeline.clips[0]],
      },
    })).toThrow();
  });
});
