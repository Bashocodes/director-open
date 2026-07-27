import { describe, expect, it, vi } from 'vitest';
import {
  directorAdobePlateProject,
  prepareDirectorAdobeHandoff,
} from './adobeEffectPlates';
import type { ReelProject } from './types';

function project(): ReelProject {
  return {
    id: 'reel-1',
    title: 'Exact Adobe',
    aspectRatio: '9:16',
    fps: 30,
    quality: 'high',
    renderBackend: 'after-effects',
    colorDepth: 32,
    clips: [{
      id: 'clip-1',
      objectId: null,
      title: 'Pixel clip',
      imageUrl: 'blob:pixel',
      sourceFile: new File(['pixel-source'], 'pixel.jpg', { type: 'image/jpeg' }),
      duration: 6.4,
      effect: 'cinematic',
      gradeStack: ['cinematic'],
      visualEffect: 'pixel-sort',
      visualEffectStack: ['pixel-sort', 'crt-scan'],
      transition: 'crossfade',
      transitionDuration: 0.45,
      motion: 'pull-out',
      intensity: 62,
      textLayers: [],
    }, {
      id: 'clip-2',
      objectId: null,
      title: 'Clean clip',
      imageUrl: 'blob:clean',
      sourceFile: new File(['clean-source'], 'clean.jpg', { type: 'image/jpeg' }),
      duration: 3.2,
      effect: 'clean',
      visualEffect: 'none',
      transition: 'cut',
      transitionDuration: 0,
      motion: 'push-in',
      intensity: 50,
      textLayers: [],
    }],
    selectedClipIds: ['clip-1'],
    audio: null,
    renderRequested: false,
  };
}

describe('exact Director effect plates for Adobe', () => {
  it('renders the selected motion and visual effects without baking the grade or transition', () => {
    const reel = project();
    const plate = directorAdobePlateProject(reel, reel.clips[0]);

    expect(plate.clips).toHaveLength(1);
    expect(plate.clips[0]).toMatchObject({
      effect: 'clean',
      gradeStack: ['clean'],
      visualEffectStack: ['pixel-sort', 'crt-scan'],
      motion: 'pull-out',
      transition: 'cut',
      transitionDuration: 0,
      textLayers: [],
    });
    expect(plate.audio).toBeNull();
    expect(plate.renderBackend).toBe('ffmpeg');
  });

  it('packages exact plates only for clips that have selected visual effects', async () => {
    const renderPlate = vi.fn(async () => (
      new Blob(['exact-director-effect'], { type: 'video/mp4' })
    ));
    const callbacks = {
      onStage: vi.fn(),
      onProgress: vi.fn(),
      onLog: vi.fn(),
    };

    const handoff = await prepareDirectorAdobeHandoff(
      project(),
      callbacks,
      renderPlate,
    );

    expect(renderPlate).toHaveBeenCalledOnce();
    expect(handoff.plan.timeline.clips[0]).toMatchObject({
      preparedVisualEffectStack: ['pixel-sort', 'crt-scan'],
      preparedMotion: true,
    });
    expect(handoff.plan.timeline.clips[1]).toMatchObject({
      preparedVisualEffectStack: [],
      preparedMotion: false,
    });
    expect(handoff.plan.media[0].mimeType).toBe('video/mp4');
    expect(handoff.plan.media[1].mimeType).toBe('image/jpeg');
  });
});
