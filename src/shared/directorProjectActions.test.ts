import { describe, expect, it } from 'vitest';
import type {
  DirectorCanvasAction,
  DirectorReelAction,
} from './directorSchemas';
import {
  createDirectorLocalMediaReference,
  DirectorProjectFileSchema,
  type DirectorProjectFile,
} from './directorProject';
import {
  applyDirectorProjectActions,
  serializeDirectorProjectContext,
} from './directorProjectActions';

const emptySummary = {
  emotion: [],
  materials: [],
  composition: [],
  palette: [],
  lighting: [],
  camera: [],
  world: [],
  style: [],
  subjects: [],
};

function fixtureProject(withReel = true): DirectorProjectFile {
  return DirectorProjectFileSchema.parse({
    version: 1,
    sessionId: 'fixture-session-1',
    updatedAt: '2026-01-02T03:04:05.000Z',
    title: 'Fixture project',
    objects: [{
      id: 'object-1',
      title: 'Private filename.png',
      subtitle: 'Imported locally',
      kind: 'upload',
      source: 'UPLOAD',
      imageUrl: createDirectorLocalMediaReference('object', 'object-1'),
      position: { x: 10, y: 20 },
      inherit: [],
      locks: [],
      summary: emptySummary,
    }],
    selectedIds: ['object-1'],
    mode: 'animate',
    goal: 'Original goal',
    exclusions: [],
    contract: null,
    sequence: null,
    continuity: null,
    reelProject: withReel ? {
      id: 'reel-1',
      title: 'Fixture reel',
      aspectRatio: '9:16',
      fps: 30,
      quality: 'high',
      clips: [{
        id: 'clip-1',
        objectId: 'object-1',
        title: 'Private filename',
        imageUrl: createDirectorLocalMediaReference('clip', 'clip-1'),
        duration: 3,
        effect: 'clean',
        visualEffect: 'none',
        transition: 'cut',
        transitionDuration: 0,
        motion: 'still',
        intensity: 60,
        caption: '',
      }],
      selectedClipIds: ['clip-1'],
      audio: null,
      renderRequested: false,
    } : null,
    reelOpen: withReel,
    visibleSearch: null,
    messages: [],
    model: 'gpt-5.4',
    localMediaOmitted: withReel ? 2 : 1,
  });
}

function canvasAction(
  type: DirectorCanvasAction['type'],
  values: Partial<DirectorCanvasAction> = {},
): DirectorCanvasAction {
  return {
    type,
    query: null,
    count: null,
    objectIds: [],
    objectId: null,
    channels: [],
    goal: null,
    exclusions: [],
    ...values,
  };
}

function reelAction(
  type: DirectorReelAction['type'],
  values: Partial<DirectorReelAction> = {},
): DirectorReelAction {
  return {
    type,
    objectIds: [],
    clipIds: [],
    aspectRatio: null,
    fps: null,
    quality: null,
    effect: null,
    visualEffect: null,
    transition: null,
    motion: null,
    duration: null,
    intensity: null,
    caption: null,
    ...values,
  };
}

describe('Director project action transaction', () => {
  it('applies valid canvas and reel edits sequentially with deterministic receipts', () => {
    const initial = fixtureProject();
    const result = applyDirectorProjectActions(initial, [
      canvasAction('set_goal', { goal: 'A sharper opening.' }),
      reelAction('style_clips', { clipIds: ['clip-1'], effect: 'warm' }),
    ], {
      createId: (prefix) => `${prefix}-deterministic`,
      now: () => '2026-02-03T04:05:06.000Z',
    });

    expect(result.project.goal).toBe('A sharper opening.');
    expect(result.project.reelProject?.clips[0].effect).toBe('warm');
    expect(result.project.updatedAt).toBe('2026-02-03T04:05:06.000Z');
    expect(result.receipts.map(({ status, code }) => ({ status, code }))).toEqual([
      { status: 'applied', code: 'applied' },
      { status: 'applied', code: 'applied' },
    ]);
    expect(result.appliedCount).toBe(2);
    expect(result.rejectedCount).toBe(0);
    expect(initial.goal).toBe('Original goal');
    expect(initial.reelProject?.clips[0].effect).toBe('clean');
  });

  it('rejects a schema-invalid batch atomically', () => {
    const initial = fixtureProject();
    const invalid = {
      ...reelAction('style_clips', { clipIds: ['clip-1'] }),
      duration: 13,
    };
    const result = applyDirectorProjectActions(initial, [
      canvasAction('set_goal', { goal: 'Must not apply.' }),
      invalid,
    ], {
      createId: (prefix) => `${prefix}-unused`,
      now: () => '2026-02-03T04:05:06.000Z',
    });

    expect(result.project).toEqual(initial);
    expect(result.appliedCount).toBe(0);
    expect(result.receipts.map((receipt) => receipt.code)).toEqual([
      'schema_invalid',
      'schema_invalid',
    ]);
    expect(result.receipts[1].issues?.[0].path).toBe('duration');
  });

  it('reports stale, unsupported, and no-op actions without changing the document', () => {
    const initial = fixtureProject();
    const result = applyDirectorProjectActions(initial, [
      reelAction('style_clips', { clipIds: ['missing'], effect: 'warm' }),
      canvasAction('search_and_add', { query: 'portrait', count: 1 }),
      canvasAction('set_goal', { goal: initial.goal }),
    ], {
      createId: (prefix) => `${prefix}-unused`,
      now: () => '2026-02-03T04:05:06.000Z',
    });

    expect(result.project).toEqual(initial);
    expect(result.receipts.map((receipt) => receipt.code)).toEqual([
      'stale_target',
      'unsupported_action',
      'no_change',
    ]);
    expect(result.appliedCount).toBe(0);
  });

  it('reports only the canvas targets that were actually applied', () => {
    const initial = { ...fixtureProject(), selectedIds: [] };
    const result = applyDirectorProjectActions(initial, [
      canvasAction('select_objects', { objectIds: ['object-1', 'missing'] }),
      canvasAction('remove_objects', { objectIds: ['object-1', 'missing'] }),
    ], {
      createId: (prefix) => `${prefix}-unused`,
      now: () => '2026-02-03T04:05:06.000Z',
    });

    expect(result.receipts.map((receipt) => receipt.appliedAction?.objectIds)).toEqual([
      ['object-1'],
      ['object-1'],
    ]);
    expect(result.receipts.map((receipt) => receipt.message)).toEqual([
      'selected 1 canvas object',
      'removed 1 canvas object',
    ]);
  });

  it('creates reel clips from headless local-media references', () => {
    const initial = fixtureProject(false);
    const result = applyDirectorProjectActions(initial, [
      reelAction('add_clips', { objectIds: ['object-1'] }),
    ], {
      createId: (prefix) => `${prefix}-1`,
      now: () => '2026-02-03T04:05:06.000Z',
    });

    expect(result.appliedCount).toBe(1);
    expect(result.project.reelProject).toMatchObject({
      id: 'reel-1',
      clips: [{
        id: 'clip-1',
        objectId: 'object-1',
        imageUrl: 'local-media:clip:clip-1',
      }],
    });
  });

  it('reuses the compact canvas serializer without exposing media references or names', () => {
    const serialized = serializeDirectorProjectContext(fixtureProject(), 1_000);
    expect(JSON.parse(serialized)).toMatchObject({
      format: 'director-canvas-context-v1',
      reel: { clips: [{ id: 'clip-1', effect: 'clean' }] },
    });
    expect(serialized).not.toContain('local-media:');
    expect(serialized).not.toContain('Private filename');
  });
});
