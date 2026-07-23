import type {
  ContinuityReport,
  DirectionContract,
  StorySequence,
} from '../../shared/directorSchemas';
import type { CanvasMode, CanvasObject, ChatTurn } from '../../pages/director/types';
import type { ReelProject } from '../../pages/director/reel/types';
import {
  parseDirectorProjectFile,
  type DirectorProjectFile,
} from '../../shared/directorProject';

export type DirectorContextInput = {
  mode: CanvasMode;
  goal: string;
  exclusions: string[];
  objects: CanvasObject[];
  selectedIds: string[];
  contract: DirectionContract | null;
  sequence: StorySequence | null;
  continuity: ContinuityReport | null;
  reelProject: ReelProject | null;
  reelOpen: boolean;
  messages: ChatTurn[];
};

const MAX_FIELD_LENGTH = 240;

function compactText(value: string, max = MAX_FIELD_LENGTH) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function recentActions(messages: ChatTurn[]) {
  return messages
    .flatMap((message) => [
      ...(message.response?.canvasActions || []),
      ...(message.response?.reelActions || []),
    ])
    .slice(-12);
}

export function serializeDirectorContext(
  input: DirectorContextInput,
  tokenBudget = 2_500,
) {
  const selected = new Set(input.selectedIds);
  const payload = {
    format: 'director-canvas-context-v1',
    mode: input.mode,
    goal: compactText(input.goal, 1_000),
    exclusions: input.exclusions.map((item) => compactText(item, 160)).slice(0, 24),
    canvas: input.objects.slice(0, 48).map((object) => ({
      id: object.id,
      kind: object.kind,
      selected: selected.has(object.id),
      inherit: object.inherit,
      locks: object.locks.map((lock) => compactText(lock)).slice(0, 20),
      summary: object.summary,
    })),
    directionContract: input.contract ? {
      title: compactText(input.contract.title),
      objective: compactText(input.contract.objective, 1_000),
      inheritance: input.contract.inheritance.map(({ sourceTitle: _sourceTitle, ...item }) => ({
        ...item,
        rationale: compactText(item.rationale, 500),
      })),
      locks: input.contract.locks.map((item) => compactText(item)).slice(0, 20),
      exclusions: input.contract.exclusions.map((item) => compactText(item)).slice(0, 24),
      conflicts: input.contract.conflicts.map((item) => ({
        issue: compactText(item.issue, 500),
        resolution: compactText(item.resolution, 500),
      })),
      coherence: input.contract.coherence,
    } : null,
    sequence: input.sequence,
    continuity: input.continuity,
    reel: input.reelProject ? {
      open: input.reelOpen,
      aspectRatio: input.reelProject.aspectRatio,
      fps: input.reelProject.fps,
      quality: input.reelProject.quality,
      selectedClipIds: input.reelProject.selectedClipIds,
      clips: input.reelProject.clips.slice(0, 16).map((clip) => ({
        id: clip.id,
        objectId: clip.objectId,
        duration: clip.duration,
        effect: clip.effect,
        gradeStack: clip.gradeStack || [],
        visualEffect: clip.visualEffect,
        visualEffectStack: clip.visualEffectStack || [],
        transition: clip.transition,
        transitionDuration: clip.transitionDuration,
        motion: clip.motion,
        intensity: clip.intensity,
        pluginParams: clip.pluginParams || {},
        caption: compactText(clip.caption, 180),
      })),
      hasAudio: Boolean(input.reelProject.audio),
    } : null,
    recentActions: recentActions(input.messages),
  };

  const maxCharacters = Math.max(1_600, tokenBudget * 4);
  let serialized = JSON.stringify(payload);
  if (serialized.length <= maxCharacters) return serialized;

  payload.canvas = payload.canvas.slice(0, 16);
  payload.recentActions = payload.recentActions.slice(-6);
  serialized = JSON.stringify({ ...payload, contextTruncated: true });
  if (serialized.length <= maxCharacters) return serialized;

  const compact = {
    ...payload,
    canvas: payload.canvas.map(({ summary: _summary, locks, ...object }) => ({
      ...object,
      lockCount: locks.length,
    })),
    directionContract: input.contract ? {
      title: compactText(input.contract.title),
      objective: compactText(input.contract.objective, 600),
      locks: input.contract.locks.slice(0, 10),
      exclusions: input.contract.exclusions.slice(0, 10),
    } : null,
    sequence: input.sequence ? {
      title: compactText(input.sequence.title),
      arc: compactText(input.sequence.arc, 600),
      beats: input.sequence.beats.map((beat) => ({
        id: beat.id,
        order: beat.order,
        title: compactText(beat.title),
        emotion: compactText(beat.emotion),
        visualAction: compactText(beat.visualAction),
      })),
    } : null,
    continuity: input.continuity ? { score: input.continuity.score } : null,
    recentActions: payload.recentActions.slice(-3),
    contextTruncated: true,
  };
  serialized = JSON.stringify(compact);
  if (serialized.length <= maxCharacters) return serialized;

  const minimal = {
    format: payload.format,
    mode: payload.mode,
    goal: payload.goal.slice(0, 400),
    exclusions: payload.exclusions.slice(0, 8),
    canvas: compact.canvas.slice(0, 8),
    reel: payload.reel ? {
      open: payload.reel.open,
      aspectRatio: payload.reel.aspectRatio,
      fps: payload.reel.fps,
      quality: payload.reel.quality,
      clips: payload.reel.clips.slice(0, 4),
    } : null,
    contextTruncated: true,
  };
  serialized = JSON.stringify(minimal);
  if (serialized.length <= maxCharacters) return serialized;
  return JSON.stringify({
    format: payload.format,
    mode: payload.mode,
    goal: payload.goal.slice(0, 240),
    exclusions: payload.exclusions.slice(0, 4),
    canvasObjectIds: compact.canvas.slice(0, 8).map((object) => object.id),
    reel: payload.reel ? {
      open: payload.reel.open,
      aspectRatio: payload.reel.aspectRatio,
      fps: payload.reel.fps,
      quality: payload.reel.quality,
      clipIds: payload.reel.clips.slice(0, 8).map((clip) => clip.id),
    } : null,
    contextTruncated: true,
  });
}

/** Serialize a schema-validated file project through the same canvas context path. */
export function serializeDirectorProjectContext(
  project: DirectorProjectFile,
  tokenBudget?: number,
) {
  const parsed = parseDirectorProjectFile(project);
  return serializeDirectorContext({
    mode: parsed.mode,
    goal: parsed.goal,
    exclusions: parsed.exclusions,
    objects: parsed.objects,
    selectedIds: parsed.selectedIds,
    contract: parsed.contract,
    sequence: parsed.sequence,
    continuity: parsed.continuity,
    reelProject: parsed.reelProject,
    reelOpen: parsed.reelOpen,
    messages: parsed.messages,
  }, tokenBudget);
}
