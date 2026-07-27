import { describe, expect, it } from 'vitest';
import type { DirectorAdobeRenderPlan } from '../../../src/shared/directorAdobeContract';
import { buildDirectorAfterEffectsScript } from '../src/extendScript';

const plan: DirectorAdobeRenderPlan = {
  version: 1,
  product: 'director-open',
  backend: 'after-effects',
  projectId: 'reel-1',
  title: 'Test reel',
  composition: {
    name: 'Test reel — Director Adobe',
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
    filename: 'test.mov',
    outputModuleTemplateCandidates: ['Apple ProRes 4444', 'ProRes 4444'],
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
      title: 'Opening',
      mediaId: 'clip-media-clip-1',
      startSeconds: 0,
      durationSeconds: 3,
      incomingOverlapSeconds: 0,
      sourceTimeSeconds: 0,
      gradeStack: ['cinematic'],
      visualEffectStack: ['pixel-sort'],
      preparedVisualEffectStack: ['pixel-sort'],
      preparedMotion: true,
      transition: 'cut',
      transitionDurationSeconds: 0,
      motion: 'still',
      intensity: 60,
      pluginParams: {},
      textLayers: [{
        id: 'text-1',
        content: 'Director',
        x: 0.5,
        y: 0.8,
        anchor: 'center',
        widthFraction: 0.8,
        rotation: 0,
        style: {
          fontId: 'inter',
          sizePreset: 'M',
          sizePx: 64,
          weight: 'bold',
          italic: false,
          color: '#ffffff',
          letterSpacing: 0,
          lineHeight: 1.15,
          align: 'center',
          case: 'none',
          background: { kind: 'scrim', color: '#000000', opacity: 0.5 },
          outline: { color: '#000000', width: 1 },
          shadow: { color: '#000000', blur: 8, offsetX: 0, offsetY: 2 },
        },
        timing: { inSec: 0, outSec: 3, fadeInSec: 0.1, fadeOutSec: 0.1 },
      }],
    }],
    beats: {
      enabled: true,
      source: 'native-audio-amplitude',
      markerLayerName: 'Director Beat Map',
      threshold: 10,
      riseRatio: 1.12,
      minimumGapSeconds: 0.125,
      pulseDurationSeconds: 0.08,
    },
  },
  media: [
    { id: 'clip-media-clip-1', kind: 'clip', relativePath: 'media/clip-01-opening.png', originalName: 'opening.png', mimeType: 'image/png', bytes: 12, available: true },
    { id: 'director-audio', kind: 'audio', relativePath: 'media/audio-song.wav', originalName: 'song.wav', mimeType: 'audio/wav', bytes: 12, available: true },
  ],
  effectContracts: {
    pixelSort: { id: 'director-pixel-sort', displayName: 'Director Pixel Sort', beatAmountParameter: 'Beat Amount' },
    beatSync: { id: 'director-beat-sync', displayName: 'Director Beat Sync' },
  },
};

describe('Director After Effects bridge script', () => {
  it('includes the 32-bpc HLG contract, media import, effect contract, and queued output', () => {
    const script = buildDirectorAfterEffectsScript(plan, {
      'clip-media-clip-1': '/tmp/media/opening.png',
      'director-audio': '/tmp/media/song.wav',
    }, '/tmp/output/test.mov');

    expect(script).toContain('project.bitsPerChannel = 32');
    expect(script).toContain('Rec.2100 HLG Scene W100');
    expect(script).toContain('/tmp/media/opening.png');
    expect(script).toContain('director-pixel-sort');
    expect(script).not.toContain('Director Pixel Sort is required by clip');
    expect(script).toContain('Director refuses to substitute blur for pixel sorting');
    expect(script).toContain('director-exact-plate');
    expect(script).not.toContain('Director PS - Beat');
    expect(script).not.toContain('Director PS - Streaks');
    expect(script).toContain('/tmp/output/test.mov');
    expect(script).toContain('Convert Audio to Keyframes');
    expect(script).toContain('Beat Amount');
    expect(script).toContain('outputModule.applyTemplate');
    expect(script).toContain('IG HDR HLG ProRes');
    expect(script).toContain('result.outputCodec = appliedProfile.codec');
    expect(script).toContain('directorQueueSuffix = "-director-adobe.mov"');
    expect(script).toContain('minimumGapSeconds: 0.125');
    expect(script).toContain('projectItemIdsBefore[String(cleanupItem.id)]');
    expect(script).toContain('getFontsByPostScriptName');
    expect(script).toContain('!fontObjects[candidateIndex].isSubstitute');
    expect(script).toContain('"adobeFontCandidates":["Inter-Bold","InterBold","Inter-Regular","Inter","Arial-BoldMT"');
    expect(script).not.toContain('Arial-ItalicMT');
    expect(script).toContain('native-shape');
    expect(script).toContain('ADBE Geometry2');
    expect(script).toContain('item.incomingOverlapSeconds');
    expect(script).toContain('effectiveBeatThreshold');
    expect(script).toContain('ADBE PhotoFilterPS');
    expect(script).toContain('ADBE Tint');
    expect(script).not.toContain('"ADBE Black&White"');
    expect(script).not.toContain('"ADBE Vibrance"');
    expect(script).not.toContain('"ADBE Find Edges"');
    expect(script).not.toContain('"CC Ball Action"');
    expect(() => Function(script)).not.toThrow();
  });
});
