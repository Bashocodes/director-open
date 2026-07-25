import { describe, expect, it } from 'vitest';
import type { DirectorResponse, VisualSummary } from '../../shared/directorSchemas';
import { applyDirectorCanvasActions } from './directorActions';
import type { CanvasObject } from './types';

const summary: VisualSummary = {
  emotion: ['resolute'], materials: ['bronze'], composition: ['portrait'], palette: ['ochre'],
  lighting: ['hard sunlight'], camera: ['medium portrait'], world: ['desert'], style: ['cinematic'], subjects: ['warrior'],
};

const response = (canvasActions: DirectorResponse['canvasActions']): DirectorResponse => ({
  message: 'Done.', mode: 'inherit', directionBrief: null, sequence: null,
  continuity: null, canvasActions, reelActions: [], suggestedActions: [],
});

const reference = (id: string): CanvasObject => ({
  id, title: id, subtitle: 'Local image', kind: 'upload', source: 'UPLOAD',
  position: { x: 0, y: 0 }, inherit: [], locks: [], summary,
});

const empty = { objects: [] as CanvasObject[], selectedIds: [] as string[], goal: 'Old goal', exclusions: [] as string[] };

describe('Director executable canvas actions', () => {
  it('ignores the retired search action without mutating local canvas state', () => {
    const action = {
      type: 'search_and_add' as const, query: 'warrior', count: 3, objectIds: [], objectId: null,
      channels: ['emotion' as const], goal: null, exclusions: [],
    };
    const result = applyDirectorCanvasActions(empty, response([action]), [], () => 'unused');

    expect(result).toEqual(empty);
  });

  it('executes selection, inheritance, removal, goal, and exclusions against object ids', () => {
    const initial = { ...empty, objects: [reference('one'), reference('two')] };
    const result = applyDirectorCanvasActions(initial, response([
      { type: 'select_objects', query: null, count: null, objectIds: ['one', 'missing'], objectId: null, channels: [], goal: null, exclusions: [] },
      { type: 'set_inheritance', query: null, count: null, objectIds: [], objectId: 'one', channels: ['palette', 'lighting'], goal: null, exclusions: [] },
      { type: 'remove_objects', query: null, count: null, objectIds: ['two'], objectId: null, channels: [], goal: null, exclusions: [] },
      { type: 'set_goal', query: null, count: null, objectIds: [], objectId: null, channels: [], goal: 'New campaign', exclusions: [] },
      { type: 'set_exclusions', query: null, count: null, objectIds: [], objectId: null, channels: [], goal: null, exclusions: ['neon', ' neon ', 'text'] },
    ]), [], () => 'unused');

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].inherit).toEqual(['palette', 'lighting']);
    expect(result.selectedIds).toEqual(['one']);
    expect(result.goal).toBe('New campaign');
    expect(result.exclusions).toEqual(['neon', 'text']);
  });
});
