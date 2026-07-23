import { z } from 'zod';
import {
  DirectorActionSchema,
  DirectorCanvasActionSchema,
  DirectorReelActionSchema,
  MAX_DIRECTOR_ACTIONS,
  type DirectorAction,
  type DirectorCanvasAction,
  type DirectorReelAction,
} from '../../shared/directorSchemas';

export const DIRECTOR_ACTIONS_MARKER = 'DIRECTOR_ACTIONS_JSON';

/** @deprecated Import DirectorActionSchema from shared/directorSchemas. */
export const DirectorAiActionSchema = DirectorActionSchema;

export const DirectorAiProposalSchema = z.object({
  explanation: z.string().min(1).max(4_000),
  actions: z.array(DirectorAiActionSchema).max(MAX_DIRECTOR_ACTIONS),
}).strict();

/** @deprecated Import DirectorAction from shared/directorSchemas. */
export type DirectorAiAction = DirectorAction;
export type DirectorAiProposal = z.infer<typeof DirectorAiProposalSchema>;
export { MAX_DIRECTOR_ACTIONS };

export class DirectorAiResponseError extends Error {
  constructor(
    message: string,
    readonly code: 'malformed-json' | 'schema-invalid',
  ) {
    super(message);
    this.name = 'DirectorAiResponseError';
  }
}

const ACTION_ARRAY_JSON_SCHEMA = z.toJSONSchema(
  z.array(DirectorAiActionSchema).max(MAX_DIRECTOR_ACTIONS),
);

export const DIRECTOR_SYSTEM_PROMPT = [
  'You are Director, a reel-editing creative director inside a browser-local canvas and timeline.',
  'Use only the supplied project context. Never claim to inspect image pixels: media bytes are deliberately not sent to you.',
  'Never use search_and_add. This local-only project has no remote search or media service.',
  'When the user asks for edits, propose validated Director actions. A person must explicitly apply every proposal.',
  'Never say an edit has already been applied. Do not create agent loops or request external media.',
  '',
  'Return exactly:',
  '1. A short plain-language explanation.',
  `2. A line containing only ${DIRECTOR_ACTIONS_MARKER}.`,
  '3. A JSON array that conforms to the schema below. Return [] when no edit is needed.',
  'For every action, include every field required by its flat schema. Use null or [] for fields that do not apply.',
  JSON.stringify(ACTION_ARRAY_JSON_SCHEMA),
].join('\n');

function stripCodeFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJson(value: string) {
  try {
    return JSON.parse(stripCodeFence(value)) as unknown;
  } catch {
    throw new DirectorAiResponseError(
      'The provider returned malformed action JSON. No edits were applied.',
      'malformed-json',
    );
  }
}

export function parseDirectorAiResponse(raw: string): DirectorAiProposal {
  const markerIndex = raw.indexOf(DIRECTOR_ACTIONS_MARKER);
  let candidate: unknown;
  let explanation = '';

  if (markerIndex >= 0) {
    explanation = raw.slice(0, markerIndex).trim();
    candidate = parseJson(raw.slice(markerIndex + DIRECTOR_ACTIONS_MARKER.length));
  } else {
    const parsed = parseJson(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      explanation = typeof record.explanation === 'string' ? record.explanation : '';
      candidate = record.actions;
    } else {
      candidate = parsed;
    }
  }

  const result = DirectorAiProposalSchema.safeParse({ explanation, actions: candidate });
  if (!result.success) {
    throw new DirectorAiResponseError(
      'The provider proposed actions that do not match the Director schema. No edits were applied.',
      'schema-invalid',
    );
  }
  return result.data;
}

export function streamingExplanation(raw: string) {
  const markerIndex = raw.indexOf(DIRECTOR_ACTIONS_MARKER);
  if (markerIndex >= 0) return raw.slice(0, markerIndex).trim();
  let visible = raw;
  for (let length = Math.min(raw.length, DIRECTOR_ACTIONS_MARKER.length - 1); length > 0; length -= 1) {
    if (DIRECTOR_ACTIONS_MARKER.startsWith(raw.slice(-length))) {
      visible = raw.slice(0, -length);
      break;
    }
  }
  return visible.trim();
}

export function splitDirectorActions(actions: DirectorAiAction[]) {
  return {
    canvasActions: actions.filter((action): action is DirectorCanvasAction => (
      DirectorCanvasActionSchema.safeParse(action).success
    )),
    reelActions: actions.filter((action): action is DirectorReelAction => (
      DirectorReelActionSchema.safeParse(action).success
    )),
  };
}

export function describeDirectorAction(action: DirectorAiAction) {
  switch (action.type) {
    case 'select_objects':
      return `Select ${action.objectIds.length} canvas object${action.objectIds.length === 1 ? '' : 's'}`;
    case 'set_inheritance':
      return `Set ${action.channels.join(', ') || 'no'} inheritance on ${action.objectId || 'a canvas object'}`;
    case 'remove_objects':
      return `Remove ${action.objectIds.length} canvas object${action.objectIds.length === 1 ? '' : 's'}`;
    case 'set_goal':
      return `Update the creative goal to “${action.goal || ''}”`;
    case 'set_exclusions':
      return `Replace exclusions with ${action.exclusions.length} item${action.exclusions.length === 1 ? '' : 's'}`;
    case 'search_and_add':
      return 'Search-and-add is unavailable in this local-only build';
    case 'open_reel_studio':
      return 'Open Reel Studio';
    case 'add_clips':
      return `Add ${action.objectIds.length} canvas item${action.objectIds.length === 1 ? '' : 's'} to the reel`;
    case 'remove_clips':
      return `Remove ${action.clipIds.length} reel clip${action.clipIds.length === 1 ? '' : 's'}`;
    case 'reorder_clips':
      return `Reorder ${action.clipIds.length} reel clip${action.clipIds.length === 1 ? '' : 's'}`;
    case 'style_clips':
      return `Style ${action.clipIds.length || 'selected'} reel clip${action.clipIds.length === 1 ? '' : 's'}`;
    case 'set_project':
      return 'Update reel format and quality settings';
    case 'request_render':
      return 'Prepare the reel for a local render';
  }
}
