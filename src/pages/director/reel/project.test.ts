import { describe, expect, it } from 'vitest';
import type { DirectorReelAction } from '../../../shared/directorSchemas';
import type { CanvasObject } from '../types';
import { EMPTY_SUMMARY } from '../types';
import type { ReelClip, ReelProject } from './types';
import {
  applyDirectorReelActions,
  compileReelTimeline,
  createReelProject,
  ensureExecutableReelIntent,
  reconcileReelActionMessage,
  reelDuration,
  toReelProjectContext,
} from './project';

const objects: CanvasObject[] = [
  {
    id: 'upload-a', title: 'Quiet Resolve', subtitle: 'Warrior',
    kind: 'upload', source: 'UPLOAD', imageUrl: '/fixtures/emotion-reference.jpg',
    position: { x: 0, y: 0 }, inherit: [], locks: [], summary: EMPTY_SUMMARY,
  },
  {
    id: 'upload-b', title: 'Brutalist Silver', subtitle: 'World',
    kind: 'upload', source: 'UPLOAD', imageUrl: '/fixtures/material-reference.jpg',
    position: { x: 200, y: 0 }, inherit: [], locks: [], summary: EMPTY_SUMMARY,
  },
];

let index = 0;
const createId = (prefix: string) => `${prefix}-${++index}`;

function action(type: DirectorReelAction['type'], values: Partial<DirectorReelAction> = {}): DirectorReelAction {
  return {
    type, objectIds: [], clipIds: [], aspectRatio: null, fps: null, quality: null,
    effect: null, visualEffect: null, transition: null, motion: null, duration: null, intensity: null, caption: null,
    ...values,
  };
}

function apply(project: ReelProject | null, actions: DirectorReelAction[], sourceObjects = objects) {
  return applyDirectorReelActions({
    project,
    actions,
    objects: sourceObjects,
    selectedObjectIds: [],
    sequence: null,
    createId,
  });
}

function makeObjects(count: number): CanvasObject[] {
  return Array.from({ length: count }, (_, objectIndex) => ({
    ...objects[0],
    id: `reference-${objectIndex}`,
    assetId: `asset-${objectIndex}`,
    title: `Reference ${objectIndex}`,
    imageUrl: `/demo/reference-${objectIndex}.jpg`,
  }));
}

function timelineProject(clips: ReelClip[]): ReelProject {
  return {
    id: 'timeline',
    title: 'Timeline',
    aspectRatio: '9:16',
    fps: 30,
    quality: 'balanced',
    clips,
    selectedClipIds: [],
    audio: null,
    renderRequested: false,
  };
}

describe('Director reel project tools', () => {
  it('turns a clear prose-only reel request into a deterministic executable plan', () => {
    const response = {
      message: 'I initialized a kinetic timeline.',
      mode: 'animate' as const,
      directionContract: null,
      sequence: null,
      continuity: null,
      canvasActions: [],
      reelActions: [],
      suggestedActions: [],
    };
    const executable = ensureExecutableReelIntent('okay now make a reel', response, {
      hasCanvasMedia: true,
      hasReel: false,
    });
    expect(executable.reelActions.map((item) => item.type)).toEqual([
      'open_reel_studio', 'set_project', 'style_clips',
    ]);
    expect(executable.reelActions[2]).toMatchObject({
      effect: 'cinematic', transition: 'crossfade', motion: 'push-in',
    });
  });

  it('does not invent reel actions for unrelated prose or when no source media exists', () => {
    const response = {
      message: 'The direction is coherent.',
      mode: 'create' as const,
      directionContract: null,
      sequence: null,
      continuity: null,
      canvasActions: [],
      reelActions: [],
      suggestedActions: [],
    };
    expect(ensureExecutableReelIntent('Check the composition', response, {
      hasCanvasMedia: true, hasReel: false,
    })).toBe(response);
    expect(ensureExecutableReelIntent('Make a reel', response, {
      hasCanvasMedia: false, hasReel: false,
    })).toBe(response);
  });

  it('reconciles visible chat claims with executed local action receipts', () => {
    expect(reconcileReelActionMessage('I applied a warm grade.', 0, [])).toBe(
      'I did not change the reel because no executable reel action was returned.',
    );
    expect(reconcileReelActionMessage('I rendered your video.', 1, [action('request_render')])).toContain(
      'device confirmation is still required',
    );
    expect(reconcileReelActionMessage('Styled two clips.', 2, [action('style_clips')])).toContain(
      'Skipped 1 stale or no-op request',
    );
    expect(reconcileReelActionMessage('I applied warm to every clip.', 1, [action('open_reel_studio')])).toBe(
      'Applied locally: opened Reel Studio.',
    );
    expect(reconcileReelActionMessage('Done — your whole reel now uses warm.', 0, [])).toBe(
      'I did not change the reel because no executable reel action was returned.',
    );
    expect(reconcileReelActionMessage('Warm is now active across the entire reel.', 0, [], true)).toBe(
      'No local reel changes were applied this turn. Warm is now active across the entire reel.',
    );
  });

  it('turns selected canvas references into stable, capped clip identities', () => {
    index = 0;
    const project = createReelProject(objects, ['upload-b', 'upload-b'], createId);
    expect(project.clips).toHaveLength(1);
    expect(project.clips[0]).toMatchObject({ objectId: 'upload-b', imageUrl: '/fixtures/material-reference.jpg' });
    expect(new Set(project.clips.map((clip) => clip.id)).size).toBe(project.clips.length);

    const capped = createReelProject(makeObjects(20), [], createId);
    expect(capped.clips).toHaveLength(16);
  });

  it('omits local media URLs, files, audio, and filename-derived titles from model context', () => {
    index = 0;
    const project = createReelProject(objects, [], createId);
    const privateImage = new File(['private image bytes'], 'private-client-concept.png', { type: 'image/png' });
    const privateAudio = new File(['private audio bytes'], 'private-client-score.wav', { type: 'audio/wav' });
    const localProject: ReelProject = {
      ...project,
      clips: [{
        ...project.clips[0],
        title: privateImage.name,
        imageUrl: 'blob:https://director.test/private-image-token',
        sourceFile: privateImage,
        effect: 'warm',
        motion: 'pan-left',
        duration: 4.5,
        intensity: 44,
        caption: 'Bounded caption',
      }],
      audio: {
        name: privateAudio.name,
        url: 'blob:https://director.test/private-audio-token',
        sourceFile: privateAudio,
      },
    };

    const context = toReelProjectContext(localProject, true);
    expect(context?.clips[0]).toMatchObject({
      title: 'Local image 1', effect: 'warm', motion: 'pan-left', duration: 4.5,
      intensity: 44, caption: 'Bounded caption',
    });
    expect(context?.clips[0]).not.toHaveProperty('imageUrl');
    expect(context?.clips[0]).not.toHaveProperty('sourceFile');
    expect(context).not.toHaveProperty('audio');
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain('private-client');
    expect(serialized).not.toContain('private-audio');
    expect(serialized).not.toContain('blob:');
    expect(serialized).not.toContain('private image bytes');
  });

  it('executes selected-clip edits, project settings, and render requests with sanitized evidence', () => {
    index = 0;
    const initial = createReelProject(objects, [], createId);
    const selected = initial.clips[1].id;
    const result = apply({ ...initial, selectedClipIds: [selected] }, [
      action('style_clips', { visualEffect: 'rgb-split', transition: 'dip-black', motion: 'push-in', intensity: 35, duration: 4 }),
      action('set_project', { aspectRatio: '9:16', fps: 24, quality: 'high' }),
      action('request_render'),
    ]);

    expect(result.project?.clips[1]).toMatchObject({
      effect: 'clean', visualEffect: 'glitch-burst', transition: 'dip-black', motion: 'push-in', intensity: 35, duration: 4,
    });
    expect(result.project?.clips[0].visualEffect).not.toBe('glitch-burst');
    expect(result.project).toMatchObject({ fps: 24, quality: 'high', renderRequested: true });
    expect(result.appliedActions.map((item) => item.type)).toEqual([
      'style_clips', 'set_project', 'request_render',
    ]);
    expect(result.appliedActions[0].clipIds).toEqual([selected]);
    expect(result.visualEffectSubstitutionNotices).toEqual(['RGB split is now Glitch burst.']);
    expect(reconcileReelActionMessage(
      'Use RGB split.',
      1,
      [result.appliedActions[0]],
      true,
      result.visualEffectSubstitutionNotices,
    )).toContain('Compatibility update: RGB split is now Glitch burst.');
    expect(result.shouldOpen).toBe(true);
  });

  it('accepts retired visual vocabulary while mapping it to canonical state with an honest no-op receipt', () => {
    index = 0;
    const initial = createReelProject(objects, ['upload-a'], createId);
    const removed = apply(initial, [action('style_clips', { visualEffect: 'glow' })]);
    expect(removed.project?.clips[0].visualEffect).toBe('none');
    expect(removed.appliedActions).toEqual([]);
    expect(reconcileReelActionMessage(
      'Use glow.',
      1,
      removed.appliedActions,
      true,
      removed.visualEffectSubstitutionNotices,
    )).toContain('Soft glow was retired; try the HDR look color grade');

    const renamed = apply(initial, [action('style_clips', { visualEffect: 'scanlines' })]);
    expect(renamed.project?.clips[0].visualEffect).toBe('crt-scan');
    expect(renamed.visualEffectSubstitutionNotices).toEqual(['Scanlines is now CRT scan.']);
  });

  it('applies every current structural effect id without compatibility substitution', () => {
    for (const visualEffect of [
      'pixel-sort',
      'glitch-burst',
      'crt-scan',
      'halftone-reveal',
      'ripple-drift',
      'motion-echo',
      'threshold-melt',
    ] as const) {
      index = 0;
      const initial = createReelProject(objects, ['upload-a'], createId);
      const result = apply(initial, [action('style_clips', { visualEffect })]);
      expect(result.project?.clips[0].visualEffect).toBe(visualEffect);
      expect(result.visualEffectSubstitutionNotices).toEqual([]);
    }
  });

  it('extends an untouched default-duration clip to 6.4s when pixel sort is assigned', () => {
    index = 0;
    const initial = createReelProject(objects, ['upload-a'], createId);
    const result = apply(initial, [action('style_clips', { visualEffect: 'pixel-sort' })]);

    expect(result.project?.clips[0]).toMatchObject({
      visualEffect: 'pixel-sort',
      duration: 6.4,
      durationWasUserSet: false,
    });
    expect(result.appliedActions[0].promotedPixelSortClipIds).toEqual([initial.clips[0].id]);
    expect(reconcileReelActionMessage('Add pixel sort.', 1, result.appliedActions)).toContain(
      'extended its untouched 3.2s default to 6.4s for pixel sort',
    );
  });

  it('does not extend 3.2s when that duration was explicitly set by the user', () => {
    index = 0;
    const initial = createReelProject(objects, ['upload-a'], createId);
    const result = apply(initial, [
      action('style_clips', { duration: 3.2 }),
      action('style_clips', { visualEffect: 'pixel-sort' }),
    ]);

    expect(result.project?.clips[0]).toMatchObject({
      visualEffect: 'pixel-sort',
      duration: 3.2,
      durationWasUserSet: true,
    });
    expect(result.appliedActions).toHaveLength(2);
    expect(result.appliedActions[1].promotedPixelSortClipIds).toBeUndefined();
  });

  it('removes semantically irrelevant fields from every applied action receipt', () => {
    index = 0;
    const initial = createReelProject(objects, [], createId);
    const rendered = apply(initial, [action('request_render', { effect: 'warm', fps: 24 })]);
    expect(rendered.appliedActions[0]).toEqual(action('request_render'));

    const configured = apply(initial, [action('set_project', { quality: 'high', motion: 'pan-left', caption: 'Not applied' })]);
    expect(configured.appliedActions[0]).toEqual(action('set_project', { quality: 'high' }));
  });

  it('targets the valid selection for empty clipIds and all clips when the selection is empty', () => {
    index = 0;
    const initial = createReelProject(objects, [], createId);
    const second = initial.clips[1].id;
    const selectedResult = apply({
      ...initial,
      selectedClipIds: ['missing', second, second],
    }, [action('style_clips', { effect: 'warm' })]);

    expect(selectedResult.project?.selectedClipIds).toEqual([second]);
    expect(selectedResult.project?.clips.map((clip) => clip.effect)).toEqual(['cinematic', 'warm']);
    expect(selectedResult.appliedActions[0].clipIds).toEqual([second]);

    const allResult = apply({ ...initial, selectedClipIds: [] }, [
      action('style_clips', { effect: 'cool' }),
    ]);
    expect(allResult.project?.clips.every((clip) => clip.effect === 'cool')).toBe(true);
    expect(allResult.appliedActions[0].clipIds).toEqual(initial.clips.map((clip) => clip.id));
  });

  it('uses empty clipIds to remove selection or all, and cleans stale selection state', () => {
    index = 0;
    const initial = createReelProject(objects, [], createId);
    const [first, second] = initial.clips.map((clip) => clip.id);
    const selectedResult = apply({ ...initial, selectedClipIds: [first, 'missing', second] }, [
      action('remove_clips', { clipIds: [first] }),
    ]);

    expect(selectedResult.project?.clips.map((clip) => clip.id)).toEqual([second]);
    expect(selectedResult.project?.selectedClipIds).toEqual([second]);
    expect(selectedResult.project?.clips[0]).toMatchObject({ transition: 'cut', transitionDuration: 0 });

    const allResult = apply({ ...initial, selectedClipIds: [] }, [action('remove_clips')]);
    expect(allResult.project?.clips).toEqual([]);
    expect(allResult.project?.selectedClipIds).toEqual([]);
    expect(allResult.appliedActions[0].clipIds).toEqual([first, second]);
  });

  it('treats explicit unknown-only clip and object targets as no-ops', () => {
    index = 0;
    const initial = createReelProject(objects, [], createId);
    const styled = apply(initial, [
      action('style_clips', { clipIds: ['missing', 'missing'], effect: 'blur' }),
    ]);
    expect(styled.project).toEqual(initial);
    expect(styled.appliedActions).toEqual([]);
    expect(styled.shouldOpen).toBe(false);

    const added = apply(null, [action('add_clips', { objectIds: ['missing', 'missing'] })]);
    expect(added.project).toBeNull();
    expect(added.appliedActions).toEqual([]);

    const opened = apply(null, [action('open_reel_studio', { objectIds: ['missing'] })]);
    expect(opened.project?.clips).toEqual([]);
    expect(opened.appliedActions).toHaveLength(1);
    expect(opened.appliedActions[0].objectIds).toEqual([]);
  });

  it('deduplicates reorder IDs without dropping unmentioned clips', () => {
    index = 0;
    const initial = createReelProject(objects, [], createId);
    const [first, second] = initial.clips.map((clip) => clip.id);
    const result = apply(initial, [
      action('reorder_clips', { clipIds: [second, second, 'missing', first, second] }),
    ]);

    expect(result.project?.clips.map((clip) => clip.id)).toEqual([second, first]);
    expect(new Set(result.project?.clips.map((clip) => clip.id)).size).toBe(2);
    expect(result.appliedActions[0].clipIds).toEqual([second, first]);
    expect(result.project?.clips[0]).toMatchObject({ transition: 'cut', transitionDuration: 0 });
  });

  it('deduplicates additions and never grows beyond 16 clips', () => {
    index = 0;
    const sourceObjects = makeObjects(20);
    const initial = createReelProject(sourceObjects, ['reference-0'], createId);
    const result = apply(initial, [action('add_clips')], sourceObjects);

    expect(result.project?.clips).toHaveLength(16);
    expect(new Set(result.project?.clips.map((clip) => clip.id)).size).toBe(16);
    expect(new Set(result.project?.clips.map((clip) => clip.objectId)).size).toBe(16);
    expect(result.appliedActions[0].objectIds).toHaveLength(15);

    const duplicateRequest = apply(initial, [
      action('add_clips', { objectIds: ['reference-1', 'reference-1', 'reference-1'] }),
    ], sourceObjects);
    expect(duplicateRequest.project?.clips).toHaveLength(2);
    expect(duplicateRequest.appliedActions[0].objectIds).toEqual(['reference-1']);
  });

  it('clamps action values and safely normalizes blends and the first clip transition', () => {
    index = 0;
    const initial = createReelProject(objects, [], createId);
    const unsafe: ReelProject = {
      ...initial,
      clips: initial.clips.map((clip, clipIndex) => ({
        ...clip,
        transition: 'crossfade',
        transitionDuration: clipIndex === 0 ? 1.5 : 99,
      })),
      selectedClipIds: [],
    };
    const result = apply(unsafe, [
      action('style_clips', { duration: 99, intensity: -25, effect: 'warm' }),
    ]);

    expect(result.project?.clips[0]).toMatchObject({
      transition: 'cut', transitionDuration: 0, duration: 12, intensity: 0, effect: 'warm',
    });
    expect(result.project?.clips[1]).toMatchObject({ transition: 'crossfade', transitionDuration: 1.6 });
    expect(result.appliedActions[0]).toMatchObject({ duration: 12, intensity: 0 });
  });

  it('only applies supported 24 or 30 fps project settings', () => {
    index = 0;
    const initial = createReelProject(objects, [], createId);
    const invalid = apply(initial, [action('set_project', { fps: 25 as 24 })]);
    expect(invalid.project?.fps).toBe(30);
    expect(invalid.appliedActions).toEqual([]);

    const result = apply(initial, [
      action('set_project', { fps: 24 }),
      action('set_project', { fps: 30 }),
    ]);
    expect(result.project?.fps).toBe(30);
    expect(result.appliedActions.map((item) => item.fps)).toEqual([24, 30]);
  });

  it('compiles one shared transition-safe timeline and delegates reel duration to it', () => {
    const base: ReelClip = {
      id: 'a', objectId: 'a', title: 'A', imageUrl: '/a.jpg', duration: 10,
      effect: 'clean', transition: 'crossfade', transitionDuration: 2,
      motion: 'still', intensity: 50, caption: '',
    };
    const project = timelineProject([
      base,
      { ...base, id: 'b', duration: 10, transition: 'crossfade', transitionDuration: 9 },
      { ...base, id: 'c', duration: 1, transition: 'crossfade', transitionDuration: 9 },
      { ...base, id: 'd', duration: 10, transition: 'soft-dissolve', transitionDuration: 4 },
      { ...base, id: 'e', duration: 2, transition: 'cut', transitionDuration: 2 },
    ]);

    const timeline = compileReelTimeline(project);
    expect(timeline.clips).toEqual([
      { clipId: 'a', index: 0, start: 0, incomingOverlap: 0 },
      { clipId: 'b', index: 1, start: 8, incomingOverlap: 2 },
      { clipId: 'c', index: 2, start: 17.5, incomingOverlap: 0.5 },
      { clipId: 'd', index: 3, start: 18, incomingOverlap: 0.5 },
      { clipId: 'e', index: 4, start: 28, incomingOverlap: 0 },
    ]);
    expect(timeline.totalDuration).toBe(30);
    expect(reelDuration(project)).toBe(timeline.totalDuration);
    expect(compileReelTimeline(timelineProject([]))).toEqual({ clips: [], totalDuration: 0 });
  });
});
