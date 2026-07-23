import { describe, expect, it } from 'vitest';
import {
  createDirectorLocalMediaReference,
  DirectorProjectFileSchema,
  type DirectorProjectFile,
} from './directorProject';
import {
  buildHeadlessRenderPlan,
  HeadlessRenderPlanError,
} from './directorRenderPlan';

function fixtureProject(withClip = true): DirectorProjectFile {
  return DirectorProjectFileSchema.parse({
    version: 1,
    sessionId: 'render-fixture-1',
    updatedAt: '2026-01-02T03:04:05.000Z',
    title: 'Render fixture',
    objects: [],
    selectedIds: [],
    mode: 'export',
    goal: '',
    exclusions: [],
    contract: null,
    sequence: null,
    continuity: null,
    reelProject: {
      id: 'reel-1',
      title: 'Render fixture reel',
      aspectRatio: '9:16',
      fps: 30,
      quality: 'high',
      clips: withClip ? [{
        id: 'clip-1',
        objectId: null,
        title: 'Opening',
        imageUrl: createDirectorLocalMediaReference('clip', 'clip-1'),
        duration: 3,
        effect: 'hdr',
        visualEffect: 'pixel-sort',
        visualEffectStack: ['pixel-sort'],
        transition: 'cut',
        transitionDuration: 0,
        motion: 'push-in',
        intensity: 70,
        caption: 'Opening',
      }] : [],
      selectedClipIds: withClip ? ['clip-1'] : [],
      audio: null,
      renderRequested: false,
    },
    reelOpen: true,
    visibleSearch: null,
    messages: [],
    model: 'gpt-5.4',
    localMediaOmitted: withClip ? 1 : 0,
  });
}

describe('Director headless render plan', () => {
  it('derives symbolic inputs and delegates to the browser command compiler', () => {
    const plan = buildHeadlessRenderPlan(fixtureProject());

    expect(plan.inputs).toEqual({
      images: [{ inputIndex: 0, clipId: 'clip-1', name: 'image-0.media' }],
      structuralEffects: [{
        inputIndex: 1,
        clipId: 'clip-1',
        effects: ['pixel-sort'],
        pattern: 'structural-effect-0-%04d.png',
      }],
      captions: [{ inputIndex: 2, clipId: 'clip-1', name: 'caption-0.png' }],
      audio: null,
    });
    expect(plan.args.join(' ')).toContain('-i image-0.media');
    expect(plan.args.join(' ')).toContain('-i structural-effect-0-%04d.png');
    expect(plan.args.join(' ')).toContain('-i caption-0.png');
    expect(plan.args.join(' ')).toContain('-c:v libx264');
    expect(plan.filterGraph).toContain('[1:v]fps=30');
    expect(plan.filterGraph).toContain('[2:v]format=rgba');
    expect(plan.duration).toBe(3);
  });

  it('rejects missing and empty reel timelines before compiling', () => {
    const withoutReel = { ...fixtureProject(), reelProject: null, reelOpen: false };
    expect(() => buildHeadlessRenderPlan(withoutReel)).toThrowError(
      expect.objectContaining<Partial<HeadlessRenderPlanError>>({ code: 'no_reel' }),
    );
    expect(() => buildHeadlessRenderPlan(fixtureProject(false))).toThrowError(
      expect.objectContaining<Partial<HeadlessRenderPlanError>>({ code: 'empty_reel' }),
    );
  });
});
