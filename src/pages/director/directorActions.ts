import type {
  DirectorCanvasAction,
  DirectorModel,
  DirectorResponse,
} from '../../shared/directorSchemas';
import type { CanvasObject } from './types';

export type DirectorCanvasActionResult = never;

export type DirectorTurnResult = {
  response: DirectorResponse;
  model: DirectorModel;
  canvasActionResults: DirectorCanvasActionResult[];
};

type ProjectState = {
  objects: CanvasObject[];
  selectedIds: string[];
  goal: string;
  exclusions: string[];
};

function applyAction(
  state: ProjectState,
  action: DirectorCanvasAction,
) {
  if (action.type === 'select_objects') {
    const knownIds = new Set(state.objects.map((object) => object.id));
    state.selectedIds = action.objectIds.filter((id) => knownIds.has(id));
    return;
  }

  if (action.type === 'set_inheritance' && action.objectId) {
    state.objects = state.objects.map((object) => object.id === action.objectId
      ? { ...object, inherit: [...action.channels] }
      : object);
    return;
  }

  if (action.type === 'remove_objects') {
    const removed = new Set(action.objectIds);
    state.objects = state.objects.filter((object) => !removed.has(object.id));
    state.selectedIds = state.selectedIds.filter((id) => !removed.has(id));
    return;
  }

  if (action.type === 'set_goal' && action.goal?.trim()) {
    state.goal = action.goal.trim();
    return;
  }

  if (action.type === 'set_exclusions') {
    state.exclusions = [...new Set(action.exclusions.map((item) => item.trim()).filter(Boolean))].slice(0, 24);
  }
}

export function applyDirectorCanvasActions(
  initial: ProjectState,
  response: DirectorResponse,
  _results: DirectorCanvasActionResult[],
  _createId: (prefix: string) => string,
): ProjectState {
  const state: ProjectState = {
    objects: [...initial.objects],
    selectedIds: [...initial.selectedIds],
    goal: initial.goal,
    exclusions: [...initial.exclusions],
  };
  response.canvasActions.forEach((action) => applyAction(state, action));
  const remainingIds = new Set(state.objects.map((object) => object.id));
  state.selectedIds = state.selectedIds.filter((id) => remainingIds.has(id));
  return state;
}
