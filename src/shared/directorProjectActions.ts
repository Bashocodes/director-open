export { serializeDirectorProjectContext } from '../lib/ai/directorContext';
import { applyDirectorCanvasActions } from '../pages/director/directorActions';
import {
  applyDirectorReelActions,
  describeReelActionReceipt,
} from '../pages/director/reel/project';
import {
  DirectorActionSchema,
  DirectorCanvasActionSchema,
  MAX_DIRECTOR_ACTIONS,
  type DirectorAction,
  type DirectorCanvasAction,
  type DirectorReelAction,
  type DirectorResponse,
} from './directorSchemas';
import {
  createDirectorLocalMediaReference,
  DirectorProjectFileSchema,
  DirectorProjectReelSchema,
  isDirectorLocalMediaReference,
  parseDirectorProjectFile,
  type DirectorProjectFile,
} from './directorProject';

export type DirectorProjectActionReceiptCode =
  | 'applied'
  | 'schema_invalid'
  | 'stale_target'
  | 'unsupported_action'
  | 'no_change';

export type DirectorProjectActionReceipt = {
  index: number;
  status: 'applied' | 'rejected';
  code: DirectorProjectActionReceiptCode;
  actionType: string | null;
  action: DirectorAction | null;
  appliedAction?: DirectorAction;
  message: string;
  issues?: Array<{ path: string; message: string }>;
};

export type DirectorProjectActionTransaction = {
  project: DirectorProjectFile;
  receipts: DirectorProjectActionReceipt[];
  appliedCount: number;
  rejectedCount: number;
  notices: string[];
};

export type ApplyDirectorProjectActionsOptions = {
  createId: (prefix: string) => string;
  now?: () => string;
};

function rawActionType(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const type = (value as Record<string, unknown>).type;
  return typeof type === 'string' ? type : null;
}

function schemaIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
) {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function rejected(
  index: number,
  code: Exclude<DirectorProjectActionReceiptCode, 'applied'>,
  action: DirectorAction | null,
  message: string,
  issues?: DirectorProjectActionReceipt['issues'],
): DirectorProjectActionReceipt {
  return {
    index,
    status: 'rejected',
    code,
    actionType: action?.type ?? null,
    action,
    message,
    ...(issues?.length ? { issues } : {}),
  };
}

function canvasTargetIsStale(
  project: DirectorProjectFile,
  action: DirectorCanvasAction,
) {
  const objectIds = new Set(project.objects.map((object) => object.id));
  if (action.type === 'set_inheritance') {
    return Boolean(action.objectId && !objectIds.has(action.objectId));
  }
  if (action.type === 'remove_objects' || action.type === 'select_objects') {
    return action.objectIds.length > 0
      && !action.objectIds.some((id) => objectIds.has(id));
  }
  return false;
}

function reelTargetIsStale(
  project: DirectorProjectFile,
  action: DirectorReelAction,
) {
  if (
    (action.type === 'open_reel_studio' || action.type === 'add_clips')
    && action.objectIds.length > 0
  ) {
    const objectIds = new Set(project.objects.flatMap((object) => (
      object.imageUrl
      && (isDirectorLocalMediaReference(object.imageUrl, 'object')
        || object.imageUrl.startsWith('data:image/'))
        ? [object.id]
        : []
    )));
    return !action.objectIds.some((id) => objectIds.has(id));
  }
  if (
    (action.type === 'remove_clips'
      || action.type === 'reorder_clips'
      || action.type === 'style_clips')
    && action.clipIds.length > 0
  ) {
    const clipIds = new Set(project.reelProject?.clips.map((clip) => clip.id) || []);
    return !action.clipIds.some((id) => clipIds.has(id));
  }
  return false;
}

function canvasResponse(
  project: DirectorProjectFile,
  action: DirectorCanvasAction,
): DirectorResponse {
  return {
    message: '',
    mode: project.mode,
    directionContract: null,
    sequence: null,
    continuity: null,
    canvasActions: [action],
    reelActions: [],
    suggestedActions: [],
  };
}

function canvasState(project: DirectorProjectFile) {
  return {
    objects: project.objects,
    selectedIds: project.selectedIds,
    goal: project.goal,
    exclusions: project.exclusions,
  };
}

function describeCanvasAction(action: DirectorCanvasAction) {
  switch (action.type) {
    case 'select_objects':
      return `selected ${action.objectIds.length} canvas object${action.objectIds.length === 1 ? '' : 's'}`;
    case 'set_inheritance':
      return `updated inheritance on ${action.objectId}`;
    case 'remove_objects':
      return `removed ${action.objectIds.length} canvas object${action.objectIds.length === 1 ? '' : 's'}`;
    case 'set_goal':
      return 'updated the creative goal';
    case 'set_exclusions':
      return 'updated the project exclusions';
    case 'search_and_add':
      return 'search-and-add is unavailable';
  }
}

function canonicalCanvasAction(
  action: DirectorCanvasAction,
  before: ReturnType<typeof canvasState>,
  after: ReturnType<typeof canvasState>,
): DirectorCanvasAction {
  if (action.type === 'select_objects') {
    return { ...action, objectIds: after.selectedIds };
  }
  if (action.type === 'remove_objects') {
    const remainingIds = new Set(after.objects.map((object) => object.id));
    return {
      ...action,
      objectIds: before.objects
        .map((object) => object.id)
        .filter((id) => !remainingIds.has(id)),
    };
  }
  if (action.type === 'set_goal') {
    return { ...action, goal: after.goal };
  }
  if (action.type === 'set_exclusions') {
    return { ...action, exclusions: after.exclusions };
  }
  return action;
}

function headlessMediaAvailable(object: DirectorProjectFile['objects'][number]) {
  return Boolean(
    object.imageUrl
    && (
      isDirectorLocalMediaReference(object.imageUrl, 'object')
      || object.imageUrl.startsWith('data:image/')
    ),
  );
}

function normalizeHeadlessClipReferences(
  previous: DirectorProjectFile['reelProject'],
  next: ReturnType<typeof applyDirectorReelActions>['project'],
): DirectorProjectFile['reelProject'] {
  if (!next) return next;
  const previousIds = new Set(previous?.clips.map((clip) => clip.id) || []);
  return DirectorProjectReelSchema.parse({
    ...next,
    clips: next.clips.map((clip) => {
      const { sourceFile, ...persistedClip } = clip;
      void sourceFile;
      return !previousIds.has(clip.id)
        && isDirectorLocalMediaReference(clip.imageUrl, 'object')
        ? {
            ...persistedClip,
            imageUrl: createDirectorLocalMediaReference('clip', clip.id),
          }
        : persistedClip;
    }),
  });
}

function transactionAbortedReceipts(
  actions: readonly unknown[],
  parsed: Array<ReturnType<typeof DirectorActionSchema.safeParse>>,
  message: string,
) {
  return parsed.map((result, index) => {
    if (result.success) return rejected(index, 'schema_invalid', result.data, message);
    return {
      ...rejected(index, 'schema_invalid', null, message, schemaIssues(result.error.issues)),
      actionType: rawActionType(actions[index]),
    };
  });
}

/**
 * Apply a bounded action array entirely in memory. Schema-invalid batches are
 * rejected atomically; stale and no-op actions are reported individually while
 * valid siblings continue in order.
 */
export function applyDirectorProjectActions(
  project: DirectorProjectFile,
  actions: readonly unknown[],
  options: ApplyDirectorProjectActionsOptions,
): DirectorProjectActionTransaction {
  const initial = parseDirectorProjectFile(project);
  const parsed = actions.map((action) => DirectorActionSchema.safeParse(action));
  const exceedsCap = actions.length > MAX_DIRECTOR_ACTIONS;
  const hasInvalidAction = parsed.some((result) => !result.success);
  if (exceedsCap || hasInvalidAction) {
    const message = exceedsCap
      ? `Action transaction exceeds the ${MAX_DIRECTOR_ACTIONS}-action limit; nothing changed.`
      : 'Action transaction contains a schema-invalid action; nothing changed.';
    const receipts = transactionAbortedReceipts(actions, parsed, message);
    return {
      project: initial,
      receipts,
      appliedCount: 0,
      rejectedCount: receipts.length,
      notices: [],
    };
  }

  let current = initial;
  const receipts: DirectorProjectActionReceipt[] = [];
  const notices: string[] = [];

  parsed.forEach((result, index) => {
    if (!result.success) return;
    const action = result.data;
    if (action.type === 'search_and_add') {
      receipts.push(rejected(
        index,
        'unsupported_action',
        action,
        'search_and_add is unavailable in this local-only project; upload media instead.',
      ));
      return;
    }

    if (DirectorCanvasActionSchema.safeParse(action).success) {
      const canvasAction = action as DirectorCanvasAction;
      if (canvasTargetIsStale(current, canvasAction)) {
        receipts.push(rejected(
          index,
          'stale_target',
          canvasAction,
          'The canvas action targets objects that are no longer present.',
        ));
        return;
      }
      const before = canvasState(current);
      const next = applyDirectorCanvasActions(
        before,
        canvasResponse(current, canvasAction),
        [],
        options.createId,
      );
      if (JSON.stringify(before) === JSON.stringify(next)) {
        receipts.push(rejected(
          index,
          'no_change',
          canvasAction,
          'The canvas already matches this action.',
        ));
        return;
      }
      const appliedAction = canonicalCanvasAction(canvasAction, before, next);
      current = {
        ...current,
        objects: next.objects,
        selectedIds: next.selectedIds,
        goal: next.goal,
        exclusions: next.exclusions,
      };
      receipts.push({
        index,
        status: 'applied',
        code: 'applied',
        actionType: canvasAction.type,
        action: canvasAction,
        appliedAction,
        message: describeCanvasAction(appliedAction),
      });
      return;
    }

    const reelAction = action as DirectorReelAction;
    if (reelTargetIsStale(current, reelAction)) {
      receipts.push(rejected(
        index,
        'stale_target',
        reelAction,
        'The reel action targets clips or canvas objects that are no longer present.',
      ));
      return;
    }
    const reelResult = applyDirectorReelActions({
      project: current.reelProject,
      actions: [reelAction],
      objects: current.objects,
      selectedObjectIds: current.selectedIds,
      sequence: current.sequence,
      createId: options.createId,
      isObjectMediaAvailable: headlessMediaAvailable,
    });
    reelResult.visualEffectSubstitutionNotices.forEach((notice) => {
      if (!notices.includes(notice)) notices.push(notice);
    });
    const applied = reelResult.appliedActions[0];
    if (!applied) {
      receipts.push(rejected(
        index,
        'no_change',
        reelAction,
        'The reel already matches this action or has no eligible target.',
      ));
      return;
    }
    const { promotedPixelSortClipIds: _promotion, ...canonicalAction } = applied;
    current = {
      ...current,
      reelProject: normalizeHeadlessClipReferences(current.reelProject, reelResult.project),
      reelOpen: current.reelOpen || reelResult.shouldOpen,
    };
    receipts.push({
      index,
      status: 'applied',
      code: 'applied',
      actionType: canonicalAction.type,
      action: reelAction,
      appliedAction: canonicalAction,
      message: describeReelActionReceipt(applied),
    });
  });

  const appliedCount = receipts.filter((receipt) => receipt.status === 'applied').length;
  if (appliedCount > 0) {
    current = {
      ...current,
      updatedAt: options.now?.() ?? new Date().toISOString(),
    };
    current = DirectorProjectFileSchema.parse(current);
  }
  return {
    project: current,
    receipts,
    appliedCount,
    rejectedCount: receipts.length - appliedCount,
    notices,
  };
}
