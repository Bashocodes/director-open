import type {
  DirectorReelAction,
  DirectorResponse,
  ReelAspectRatio,
  ReelEffect,
  ReelMotion,
  ReelProjectContext,
  ReelQuality,
  ReelTransition,
  ReelVisualEffect,
  StorySequence,
  TextLayer,
  TextLayerStyle,
} from '../../../shared/directorSchemas';
import { MAX_TEXT_LAYER_CONTENT } from '../../../shared/directorSchemas';
import {
  resolveReelVisualEffect,
} from '../../../shared/reelVisualEffects';
import {
  createTextLayer,
  MAX_TEXT_LAYERS_PER_CLIP,
  sizePresetToPx,
} from '../../../shared/textLayers';
import { FONT_CATALOG } from '../../../lib/text/fontCatalog';
import { pluginRegistry } from '../../../plugins/registry';
import type { CanvasObject } from '../types';
import { reelGradeStack, reelVisualEffectStack, type ReelClip, type ReelProject } from './types';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const TEXT_ACTION_TYPES = new Set([
  'add_text_layer', 'update_text_layer', 'move_text_layer', 'remove_text_layer',
]);

const MAX_CLIPS = 16;
const MAX_TRANSITION_DURATION = 2;
const MIN_CLIP_DURATION = 1;
const MAX_CLIP_DURATION = 12;
const MIN_INTENSITY = 0;
const MAX_INTENSITY = 100;
const DEFAULT_CLIP_DURATION = 3.2;
const PIXEL_SORT_DEFAULT_DURATION = pluginRegistry
  .getEffect('pixel-sort', 'visual')?.preferredUntouchedDuration ?? 6.4;
const DEFAULT_TRANSITION_DURATION = 0.45;
const DEFAULT_INTENSITY = 62;

const ELIGIBLE_KINDS = new Set(['reference', 'upload', 'created']);
const ASPECT_RATIOS = ['9:16', '1:1', '16:9'] as const satisfies readonly ReelAspectRatio[];
const QUALITIES = ['draft', 'balanced', 'high', 'maximum'] as const satisfies readonly ReelQuality[];

export type ReelObjectMediaAvailability = (object: CanvasObject) => boolean;

function hasBrowserLocalMedia(object: CanvasObject) {
  return Boolean(
    object.imageUrl
    && (object.sourceFile || object.imageUrl.startsWith('data:image/')),
  );
}

export type CompiledReelTimelineClip = {
  clipId: string;
  index: number;
  start: number;
  incomingOverlap: number;
};

export type CompiledReelTimeline = {
  clips: CompiledReelTimelineClip[];
  totalDuration: number;
};

function isOneOf<const T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function clampFinite(value: number, minimum: number, maximum: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function uniqueIds(ids: readonly string[] | undefined) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids || []) {
    if (typeof id !== 'string' || id.length > 160 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length === MAX_CLIPS) break;
  }
  return result;
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function eligibleObjects(
  objects: CanvasObject[],
  mediaAvailable: ReelObjectMediaAvailability = hasBrowserLocalMedia,
) {
  const seen = new Set<string>();
  return objects.filter((object) => {
    if (!mediaAvailable(object) || !ELIGIBLE_KINDS.has(object.kind) || seen.has(object.id)) return false;
    seen.add(object.id);
    return true;
  });
}

function requestedObjects(
  objects: CanvasObject[],
  ids: readonly string[],
  mediaAvailable: ReelObjectMediaAvailability = hasBrowserLocalMedia,
) {
  const wanted = new Set(uniqueIds(ids));
  return eligibleObjects(objects, mediaAvailable).filter((object) => wanted.has(object.id));
}

function normalizeClip(clip: ReelClip, index: number) {
  let duration = clampFinite(clip.duration, MIN_CLIP_DURATION, MAX_CLIP_DURATION, DEFAULT_CLIP_DURATION);
  const intensity = clampFinite(clip.intensity, MIN_INTENSITY, MAX_INTENSITY, DEFAULT_INTENSITY);
  const requestedTransition = pluginRegistry.getTransition(clip.transition) ? clip.transition : 'crossfade';
  const transition = index === 0 ? 'cut' : requestedTransition;
  const transitionDuration = transition === 'cut'
    ? 0
    : clampFinite(clip.transitionDuration, 0, MAX_TRANSITION_DURATION, DEFAULT_TRANSITION_DURATION);
  const fallbackEffect = pluginRegistry.getEffect(clip.effect, 'grade') ? clip.effect : 'clean';
  const normalizedGradeStack = [...new Set(
    (clip.gradeStack?.length ? clip.gradeStack : [fallbackEffect])
      .filter((item) => Boolean(pluginRegistry.getEffect(item, 'grade'))),
  )].slice(0, 5);
  if (!normalizedGradeStack.length) normalizedGradeStack.push(fallbackEffect);
  const gradeStack = clip.gradeStack ? normalizedGradeStack : undefined;
  const effect = gradeStack?.[0] || fallbackEffect;
  const requestedVisualEffect = resolveReelVisualEffect(clip.visualEffect)?.id
    ?? clip.visualEffect
    ?? 'none';
  const fallbackVisualEffect = pluginRegistry.getEffect(requestedVisualEffect, 'visual')
    ? requestedVisualEffect
    : 'none';
  const normalizedVisualEffectStack = [...new Set(
    (clip.visualEffectStack?.length ? clip.visualEffectStack : [fallbackVisualEffect])
      .map((item) => resolveReelVisualEffect(item)?.id ?? item)
      .filter((item) => item !== 'none' && Boolean(pluginRegistry.getEffect(item, 'visual'))),
  )].slice(0, 5);
  const visualEffectStack = clip.visualEffectStack ? normalizedVisualEffectStack : undefined;
  const visualEffect = visualEffectStack?.[0] || fallbackVisualEffect;
  const motion = pluginRegistry.getMotion(clip.motion) ? clip.motion : 'still';
  const preferredUntouchedDuration = normalizedVisualEffectStack
    .map((id) => pluginRegistry.getEffect(id, 'visual')?.preferredUntouchedDuration ?? 0)
    .reduce((maximum, candidate) => Math.max(maximum, candidate), 0);
  if (
    duration === DEFAULT_CLIP_DURATION
    && clip.durationWasUserSet !== true
    && preferredUntouchedDuration > 0
  ) {
    duration = preferredUntouchedDuration;
  }
  if (
    duration === clip.duration
    && intensity === clip.intensity
    && transition === clip.transition
    && transitionDuration === clip.transitionDuration
    && effect === clip.effect
    && visualEffect === clip.visualEffect
    && motion === clip.motion
    && (!clip.gradeStack || sameIds(gradeStack || [], clip.gradeStack))
    && (!clip.visualEffectStack || sameIds(visualEffectStack || [], clip.visualEffectStack))
  ) return clip;
  return {
    ...clip,
    duration,
    intensity,
    effect,
    gradeStack,
    visualEffect,
    visualEffectStack,
    transition,
    transitionDuration,
    motion,
  };
}

export function normalizeReelProject(project: ReelProject) {
  const seen = new Set<string>();
  const clips: ReelClip[] = [];
  let changed = false;
  for (const clip of project.clips) {
    if (seen.has(clip.id) || clips.length === MAX_CLIPS) {
      changed = true;
      continue;
    }
    seen.add(clip.id);
    let normalized = normalizeClip(clip, clips.length);
    const previous = clips[clips.length - 1];
    if (previous && normalized.transition !== 'cut') {
      const safeTransitionDuration = Math.min(
        normalized.transitionDuration,
        previous.duration / 2,
        normalized.duration / 2,
      );
      if (safeTransitionDuration !== normalized.transitionDuration) {
        normalized = { ...normalized, transitionDuration: safeTransitionDuration };
      }
    }
    if (normalized !== clip) changed = true;
    clips.push(normalized);
  }
  const selectedClipIds = uniqueIds(project.selectedClipIds).filter((id) => seen.has(id));
  if (!sameIds(selectedClipIds, project.selectedClipIds)) changed = true;
  return changed ? { ...project, clips, selectedClipIds } : project;
}

function emptyAction(type: DirectorReelAction['type']): DirectorReelAction {
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
    layerId: null,
    content: null,
    textX: null,
    textY: null,
    fontId: null,
    sizePreset: null,
    textColor: null,
    align: null,
    inSec: null,
    outSec: null,
  };
}

function clampNullable(value: number | null, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : null;
}

type CanonicalDirectorReelAction = Omit<DirectorReelAction, 'visualEffect'> & {
  visualEffect: ReelVisualEffect | null;
};

function sanitizeAction(action: DirectorReelAction): CanonicalDirectorReelAction {
  const duration = typeof action.duration === 'number' && Number.isFinite(action.duration)
    ? clampFinite(action.duration, MIN_CLIP_DURATION, MAX_CLIP_DURATION, DEFAULT_CLIP_DURATION)
    : null;
  const intensity = typeof action.intensity === 'number' && Number.isFinite(action.intensity)
    ? clampFinite(action.intensity, MIN_INTENSITY, MAX_INTENSITY, DEFAULT_INTENSITY)
    : null;
  const canonical = emptyAction(action.type) as CanonicalDirectorReelAction;
  if (action.type === 'open_reel_studio' || action.type === 'add_clips') {
    return { ...canonical, objectIds: uniqueIds(action.objectIds) };
  }
  if (action.type === 'remove_clips' || action.type === 'reorder_clips') {
    return { ...canonical, clipIds: uniqueIds(action.clipIds) };
  }
  if (action.type === 'style_clips') {
    return {
      ...canonical,
      clipIds: uniqueIds(action.clipIds),
      effect: action.effect && pluginRegistry.getEffect(action.effect, 'grade') ? action.effect : null,
      visualEffect: resolveReelVisualEffect(action.visualEffect)?.id ?? null,
      transition: action.transition && pluginRegistry.getTransition(action.transition) ? action.transition : null,
      motion: action.motion && pluginRegistry.getMotion(action.motion) ? action.motion : null,
      duration,
      intensity,
    };
  }
  if (TEXT_ACTION_TYPES.has(action.type)) {
    return {
      ...canonical,
      clipIds: uniqueIds(action.clipIds),
      layerId: typeof action.layerId === 'string' ? action.layerId.slice(0, 160) : null,
      content: typeof action.content === 'string' ? action.content.slice(0, MAX_TEXT_LAYER_CONTENT) : null,
      textX: clampNullable(action.textX, 0, 1),
      textY: clampNullable(action.textY, 0, 1),
      fontId: action.fontId && FONT_CATALOG[action.fontId] ? action.fontId : null,
      sizePreset: action.sizePreset ?? null,
      textColor: typeof action.textColor === 'string' && HEX_COLOR.test(action.textColor) ? action.textColor : null,
      align: action.align ?? null,
      inSec: clampNullable(action.inSec, 0, 120),
      outSec: clampNullable(action.outSec, 0, 120),
    };
  }
  if (action.type === 'set_project') {
    return {
      ...canonical,
      aspectRatio: isOneOf(ASPECT_RATIOS, action.aspectRatio) ? action.aspectRatio : null,
      fps: action.fps === 24 || action.fps === 30 ? action.fps : null,
      quality: isOneOf(QUALITIES, action.quality) ? action.quality : null,
    };
  }
  return canonical;
}

function clipFromObject(
  object: CanvasObject,
  index: number,
  createId: (prefix: string) => string,
  sequence?: StorySequence | null,
  mediaAvailable: ReelObjectMediaAvailability = hasBrowserLocalMedia,
): ReelClip | null {
  if (!mediaAvailable(object) || !object.imageUrl || !ELIGIBLE_KINDS.has(object.kind)) return null;
  const beat = sequence?.beats[index];
  const motions = ['push-in', 'pan-right', 'pull-out', 'pan-left'] as const;
  return {
    id: createId('clip'),
    objectId: object.id,
    title: beat?.title || object.title,
    imageUrl: object.imageUrl,
    sourceFile: object.sourceFile,
    duration: DEFAULT_CLIP_DURATION,
    durationWasUserSet: false,
    effect: index % 3 === 0 ? 'cinematic' : 'clean',
    visualEffect: 'none',
    transition: index === 0 ? 'cut' : 'crossfade',
    transitionDuration: index === 0 ? 0 : DEFAULT_TRANSITION_DURATION,
    motion: beat ? motions[index % motions.length] : index % 2 ? 'pull-out' : 'push-in',
    intensity: DEFAULT_INTENSITY,
    textLayers: [],
  };
}

export function createReelProject(
  objects: CanvasObject[],
  selectedObjectIds: string[],
  createId: (prefix: string) => string,
  sequence?: StorySequence | null,
  mediaAvailable: ReelObjectMediaAvailability = hasBrowserLocalMedia,
): ReelProject {
  const candidates = eligibleObjects(objects, mediaAvailable);
  const selected = new Set(uniqueIds(selectedObjectIds));
  const preferred = candidates.filter((object) => selected.has(object.id));
  const sources = (preferred.length ? preferred : candidates).slice(0, MAX_CLIPS);
  const clips = sources.flatMap((object, index) => {
    const clip = clipFromObject(object, index, createId, sequence, mediaAvailable);
    return clip ? [clip] : [];
  });
  return {
    id: createId('reel'),
    title: sequence?.title || 'Director Open Reel 01',
    aspectRatio: '9:16',
    fps: 30,
    quality: 'balanced',
    clips,
    selectedClipIds: clips[0] ? [clips[0].id] : [],
    audio: null,
    renderRequested: false,
  };
}

function createReelProjectFromSources(
  sources: CanvasObject[],
  createId: (prefix: string) => string,
  sequence?: StorySequence | null,
  mediaAvailable: ReelObjectMediaAvailability = hasBrowserLocalMedia,
) {
  return createReelProject(
    sources,
    sources.map((source) => source.id),
    createId,
    sequence,
    mediaAvailable,
  );
}

function addObjects(
  project: ReelProject,
  objects: CanvasObject[],
  objectIds: string[],
  explicitTarget: boolean,
  createId: (prefix: string) => string,
  mediaAvailable: ReelObjectMediaAvailability = hasBrowserLocalMedia,
) {
  const normalized = normalizeReelProject(project);
  const known = new Set(normalized.clips.map((clip) => clip.objectId).filter((id): id is string => Boolean(id)));
  const candidates = (explicitTarget
    ? requestedObjects(objects, objectIds, mediaAvailable)
    : eligibleObjects(objects, mediaAvailable))
    .filter((object) => !known.has(object.id));
  const available = Math.max(0, MAX_CLIPS - normalized.clips.length);
  const added = candidates.slice(0, available).flatMap((object, index) => {
    const clip = clipFromObject(
      object,
      normalized.clips.length + index,
      createId,
      undefined,
      mediaAvailable,
    );
    return clip ? [clip] : [];
  });
  if (!added.length) return { project: normalized, added };
  return {
    project: normalizeReelProject({
      ...normalized,
      clips: [...normalized.clips, ...added],
      selectedClipIds: added.map((clip) => clip.id),
    }),
    added,
  };
}

function resolveClipTargets(project: ReelProject, ids: string[], explicitTarget: boolean) {
  const existing = new Set(project.clips.map((clip) => clip.id));
  if (explicitTarget) return ids.filter((id) => existing.has(id));
  const selected = uniqueIds(project.selectedClipIds).filter((id) => existing.has(id));
  return selected.length ? selected : project.clips.map((clip) => clip.id);
}

function clipsEqualForEdit(left: ReelClip, right: ReelClip) {
  return left.effect === right.effect
    && (left.visualEffect || 'none') === (right.visualEffect || 'none')
    && sameIds(reelGradeStack(left), reelGradeStack(right))
    && sameIds(reelVisualEffectStack(left), reelVisualEffectStack(right))
    && left.transition === right.transition
    && left.transitionDuration === right.transitionDuration
    && left.motion === right.motion
    && left.duration === right.duration
    && Boolean(left.durationWasUserSet) === Boolean(right.durationWasUserSet)
    && left.intensity === right.intensity
    && JSON.stringify(left.pluginParams || {}) === JSON.stringify(right.pluginParams || {})
    && JSON.stringify(left.textLayers) === JSON.stringify(right.textLayers);
}

export type AppliedDirectorReelAction = DirectorReelAction & {
  promotedPixelSortClipIds?: string[];
};

function textStyleOverrides(action: CanonicalDirectorReelAction): Partial<TextLayerStyle> {
  const overrides: Partial<TextLayerStyle> = {};
  if (action.fontId) overrides.fontId = action.fontId;
  if (action.sizePreset) {
    overrides.sizePreset = action.sizePreset;
    if (action.sizePreset !== 'custom') overrides.sizePx = sizePresetToPx(action.sizePreset, 64);
  }
  if (action.textColor) overrides.color = action.textColor;
  if (action.align) overrides.align = action.align;
  return overrides;
}

/** Apply one sanitized text-layer action to its target clip. Returns null on no-op. */
function applyTextLayerAction(
  project: ReelProject,
  action: CanonicalDirectorReelAction,
  explicitClips: boolean,
  createId: (prefix: string) => string,
): { project: ReelProject; clipId: string; layerId: string | null } | null {
  const requestedClipId = uniqueIds(action.clipIds).find((id) => project.clips.some((clip) => clip.id === id));
  const targetClipId = requestedClipId
    ?? (explicitClips
      ? null
      : project.selectedClipIds.find((id) => project.clips.some((clip) => clip.id === id))
        ?? project.clips[0]?.id
        ?? null);
  if (!targetClipId) return null;
  const clip = project.clips.find((item) => item.id === targetClipId)!;
  const before = JSON.stringify(clip.textLayers);
  let layers = clip.textLayers;
  let affectedLayerId: string | null = null;

  if (action.type === 'add_text_layer') {
    if (clip.textLayers.length >= MAX_TEXT_LAYERS_PER_CLIP) return null;
    const id = createId('text');
    layers = [...clip.textLayers, createTextLayer(id, {
      content: action.content && action.content.trim() ? action.content : 'Text',
      x: action.textX ?? 0.5,
      y: action.textY ?? 0.5,
      clipDuration: clip.duration,
      style: textStyleOverrides(action),
      timing: {
        inSec: action.inSec ?? 0,
        outSec: action.outSec ?? clip.duration,
        fadeInSec: 0,
        fadeOutSec: 0,
      },
    })];
    affectedLayerId = id;
  } else {
    const target = action.layerId
      ? clip.textLayers.find((layer) => layer.id === action.layerId)
      : clip.textLayers[clip.textLayers.length - 1];
    if (!target) return null;
    affectedLayerId = target.id;
    if (action.type === 'remove_text_layer') {
      layers = clip.textLayers.filter((layer) => layer.id !== target.id);
    } else {
      const next: TextLayer = { ...target, style: { ...target.style }, timing: { ...target.timing } };
      if (action.textX !== null) next.x = action.textX;
      if (action.textY !== null) next.y = action.textY;
      if (action.type === 'update_text_layer') {
        if (action.content !== null) next.content = action.content;
        Object.assign(next.style, textStyleOverrides(action));
        if (action.inSec !== null) next.timing.inSec = action.inSec;
        if (action.outSec !== null) next.timing.outSec = action.outSec;
      }
      layers = clip.textLayers.map((layer) => (layer.id === target.id ? next : layer));
    }
  }

  if (JSON.stringify(layers) === before) return null;
  const clips = project.clips.map((item) => (item.id === targetClipId ? { ...item, textLayers: layers } : item));
  return { project: { ...project, clips }, clipId: targetClipId, layerId: affectedLayerId };
}

export function applyDirectorReelActions(options: {
  project: ReelProject | null;
  actions: DirectorReelAction[];
  objects: CanvasObject[];
  selectedObjectIds: string[];
  sequence: StorySequence | null;
  createId: (prefix: string) => string;
  isObjectMediaAvailable?: ReelObjectMediaAvailability;
}) {
  let project = options.project ? normalizeReelProject(options.project) : null;
  let shouldOpen = false;
  const appliedActions: AppliedDirectorReelAction[] = [];
  const visualEffectSubstitutionNotices: string[] = [];
  const mediaAvailable = options.isObjectMediaAvailable ?? hasBrowserLocalMedia;

  for (const unsafeAction of options.actions) {
    const visualEffectResolution = resolveReelVisualEffect(unsafeAction.visualEffect);
    if (visualEffectResolution?.notice && !visualEffectSubstitutionNotices.includes(visualEffectResolution.notice)) {
      visualEffectSubstitutionNotices.push(visualEffectResolution.notice);
    }
    const action = sanitizeAction(unsafeAction);
    const explicitObjects = Array.isArray(unsafeAction.objectIds) && unsafeAction.objectIds.length > 0;
    const explicitClips = Array.isArray(unsafeAction.clipIds) && unsafeAction.clipIds.length > 0;

    if (action.type === 'open_reel_studio') {
      let addedObjectIds: string[] = [];
      if (!project) {
        const sources = explicitObjects
          ? requestedObjects(options.objects, action.objectIds, mediaAvailable)
          : (() => {
            const selected = requestedObjects(
              options.objects,
              options.selectedObjectIds,
              mediaAvailable,
            );
            return selected.length ? selected : eligibleObjects(options.objects, mediaAvailable);
          })();
        project = createReelProjectFromSources(
          sources.slice(0, MAX_CLIPS),
          options.createId,
          options.sequence,
          mediaAvailable,
        );
        addedObjectIds = project.clips.flatMap((clip) => clip.objectId ? [clip.objectId] : []);
      } else if (project.clips.length === 0) {
        const result = addObjects(
          project,
          options.objects,
          action.objectIds,
          explicitObjects,
          options.createId,
          mediaAvailable,
        );
        project = result.project;
        addedObjectIds = result.added.flatMap((clip) => clip.objectId ? [clip.objectId] : []);
      }
      shouldOpen = true;
      appliedActions.push({ ...action, objectIds: addedObjectIds });
      continue;
    }

    if (action.type === 'add_clips') {
      if (!project) {
        const sources = explicitObjects
          ? requestedObjects(options.objects, action.objectIds, mediaAvailable)
          : (() => {
            const selected = requestedObjects(
              options.objects,
              options.selectedObjectIds,
              mediaAvailable,
            );
            return selected.length ? selected : eligibleObjects(options.objects, mediaAvailable);
          })();
        if (!sources.length) continue;
        project = createReelProjectFromSources(
          sources.slice(0, MAX_CLIPS),
          options.createId,
          options.sequence,
          mediaAvailable,
        );
        const objectIds = project.clips.flatMap((clip) => clip.objectId ? [clip.objectId] : []);
        appliedActions.push({ ...action, objectIds });
        shouldOpen = true;
        continue;
      }
      const result = addObjects(
        project,
        options.objects,
        action.objectIds,
        explicitObjects,
        options.createId,
        mediaAvailable,
      );
      project = result.project;
      if (!result.added.length) continue;
      appliedActions.push({
        ...action,
        objectIds: result.added.flatMap((clip) => clip.objectId ? [clip.objectId] : []),
      });
      shouldOpen = true;
      continue;
    }

    if (!project) {
      if (explicitClips && (
        action.type === 'remove_clips'
        || action.type === 'reorder_clips'
        || action.type === 'style_clips'
      )) continue;
      project = createReelProject(
        options.objects,
        options.selectedObjectIds,
        options.createId,
        options.sequence,
        mediaAvailable,
      );
    }

    if (action.type === 'remove_clips') {
      const targets = resolveClipTargets(project, action.clipIds, explicitClips);
      if (!targets.length) continue;
      const removed = new Set(targets);
      project = normalizeReelProject({
        ...project,
        clips: project.clips.filter((clip) => !removed.has(clip.id)),
        selectedClipIds: project.selectedClipIds.filter((id) => !removed.has(id)),
      });
      appliedActions.push({ ...action, clipIds: targets });
      shouldOpen = true;
      continue;
    }

    if (action.type === 'reorder_clips') {
      const byId = new Map(project.clips.map((clip) => [clip.id, clip]));
      const requestedIds = action.clipIds.filter((id) => byId.has(id));
      if (!requestedIds.length) continue;
      const used = new Set(requestedIds);
      const ordered = [
        ...requestedIds.map((id) => byId.get(id)!),
        ...project.clips.filter((clip) => !used.has(clip.id)),
      ].slice(0, MAX_CLIPS);
      if (sameIds(ordered.map((clip) => clip.id), project.clips.map((clip) => clip.id))) continue;
      project = normalizeReelProject({ ...project, clips: ordered });
      appliedActions.push({ ...action, clipIds: requestedIds });
      shouldOpen = true;
      continue;
    }

    if (action.type === 'style_clips') {
      const targets = resolveClipTargets(project, action.clipIds, explicitClips);
      const hasEdit = action.effect !== null
        || action.visualEffect !== null
        || action.transition !== null
        || action.motion !== null
        || action.duration !== null
        || action.intensity !== null;
      if (!targets.length || !hasEdit) continue;
      const targeted = new Set(targets);
      const before = new Map(project.clips.map((clip) => [clip.id, clip]));
      const edited = project.clips.map((clip) => {
        if (!targeted.has(clip.id)) return clip;
        const transition = action.transition ?? clip.transition;
        return {
          ...clip,
          effect: action.effect ?? clip.effect,
          gradeStack: action.effect !== null ? [action.effect] : clip.gradeStack,
          visualEffect: action.visualEffect ?? clip.visualEffect ?? 'none',
          visualEffectStack: action.visualEffect !== null
            ? (action.visualEffect === 'none' ? [] : [action.visualEffect])
            : clip.visualEffectStack,
          transition,
          transitionDuration: transition === 'cut'
            ? 0
            : clampFinite(
              action.transition !== null && clip.transitionDuration <= 0
                ? DEFAULT_TRANSITION_DURATION
                : clip.transitionDuration,
              0,
              MAX_TRANSITION_DURATION,
              DEFAULT_TRANSITION_DURATION,
            ),
          motion: action.motion ?? clip.motion,
          duration: action.duration ?? clip.duration,
          durationWasUserSet: action.duration !== null ? true : clip.durationWasUserSet,
          intensity: action.intensity ?? clip.intensity,
        };
      });
      const next = normalizeReelProject({ ...project, clips: edited });
      const changedIds = targets.filter((id) => {
        const previousClip = before.get(id);
        const nextClip = next.clips.find((clip) => clip.id === id);
        return Boolean(previousClip && nextClip && !clipsEqualForEdit(previousClip, nextClip));
      });
      if (!changedIds.length) continue;
      const changedField = <K extends 'effect' | 'visualEffect' | 'transition' | 'transitionDuration' | 'motion' | 'duration' | 'durationWasUserSet' | 'intensity'>(field: K) => (
        changedIds.some((id) => before.get(id)?.[field] !== next.clips.find((clip) => clip.id === id)?.[field])
      );
      const promotedPixelSortClipIds = changedIds.filter((id) => {
        const previousClip = before.get(id);
        const nextClip = next.clips.find((clip) => clip.id === id);
        return previousClip?.duration === DEFAULT_CLIP_DURATION
          && previousClip.durationWasUserSet !== true
          && Boolean(nextClip)
          && nextClip?.duration === PIXEL_SORT_DEFAULT_DURATION
          && nextClip !== undefined
          && reelVisualEffectStack(nextClip).includes('pixel-sort');
      });
      project = next;
      appliedActions.push({
        ...action,
        clipIds: changedIds,
        effect: action.effect !== null && changedField('effect') ? action.effect : null,
        visualEffect: action.visualEffect !== null && changedField('visualEffect') ? action.visualEffect : null,
        transition: action.transition !== null
          && (changedField('transition') || changedField('transitionDuration')) ? action.transition : null,
        motion: action.motion !== null && changedField('motion') ? action.motion : null,
        duration: action.duration !== null
          && (changedField('duration') || changedField('durationWasUserSet')) ? action.duration : null,
        intensity: action.intensity !== null && changedField('intensity') ? action.intensity : null,
        promotedPixelSortClipIds: promotedPixelSortClipIds.length ? promotedPixelSortClipIds : undefined,
      });
      shouldOpen = true;
      continue;
    }

    if (TEXT_ACTION_TYPES.has(action.type)) {
      const result = applyTextLayerAction(project, action, explicitClips, options.createId);
      if (!result) continue;
      project = result.project;
      appliedActions.push({ ...action, clipIds: [result.clipId], layerId: result.layerId });
      shouldOpen = true;
      continue;
    }

    if (action.type === 'set_project') {
      const aspectRatio = action.aspectRatio !== null && action.aspectRatio !== project.aspectRatio
        ? action.aspectRatio
        : null;
      const fps = action.fps !== null && action.fps !== project.fps ? action.fps : null;
      const quality = action.quality !== null && action.quality !== project.quality ? action.quality : null;
      if (aspectRatio === null && fps === null && quality === null) continue;
      project = {
        ...project,
        aspectRatio: aspectRatio ?? project.aspectRatio,
        fps: fps ?? project.fps,
        quality: quality ?? project.quality,
      };
      appliedActions.push({ ...action, aspectRatio, fps, quality });
      shouldOpen = true;
      continue;
    }

    if (action.type === 'request_render') {
      project = { ...project, renderRequested: true };
      appliedActions.push(action);
      shouldOpen = true;
    }
  }
  return { project, shouldOpen, appliedActions, visualEffectSubstitutionNotices };
}

const CLEAR_REEL_CREATION_INTENT = /\b(?:make|create|build|open|start|turn|assemble|produce)\b.{0,80}\b(?:reel|video|timeline)\b|\b(?:reel|video|timeline)\b.{0,80}\b(?:make|create|build|open|start|assemble|produce)\b/i;
const CLEAR_REEL_RENDER_INTENT = /\b(?:render|export)\b.{0,80}\b(?:reel|video|mp4)\b|\b(?:reel|video|mp4)\b.{0,80}\b(?:render|export)\b/i;

/**
 * Provider output is advisory until it crosses the local action boundary. A
 * clear reel request must not become prose-only merely because a model omitted
 * the tool envelope, so this adds the smallest safe, deterministic action plan.
 */
export function ensureExecutableReelIntent(
  message: string,
  response: DirectorResponse,
  options: { hasCanvasMedia: boolean; hasReel: boolean },
): DirectorResponse {
  if (response.reelActions.length > 0) return response;
  if (CLEAR_REEL_RENDER_INTENT.test(message) && options.hasReel) {
    return {
      ...response,
      mode: 'export',
      reelActions: [emptyAction('open_reel_studio'), emptyAction('request_render')],
    };
  }
  if (!CLEAR_REEL_CREATION_INTENT.test(message) || (!options.hasCanvasMedia && !options.hasReel)) {
    return response;
  }
  return {
    ...response,
    mode: 'animate',
    reelActions: [
      emptyAction('open_reel_studio'),
      { ...emptyAction('set_project'), aspectRatio: '9:16', fps: 30, quality: 'balanced' },
      {
        ...emptyAction('style_clips'),
        effect: 'cinematic',
        transition: 'crossfade',
        motion: 'push-in',
        intensity: 62,
      },
    ],
  };
}

export function toReelProjectContext(project: ReelProject | null, open: boolean): ReelProjectContext | null {
  if (!project) return null;
  const normalized = normalizeReelProject(project);
  return {
    open,
    aspectRatio: normalized.aspectRatio,
    fps: normalized.fps,
    quality: normalized.quality,
    selectedClipIds: normalized.selectedClipIds,
    clips: normalized.clips.map((clip, index) => ({
      id: clip.id,
      objectId: clip.objectId,
      title: (clip.sourceFile ? `Local image ${index + 1}` : clip.title).slice(0, 240),
      duration: clip.duration,
      effect: clip.effect as ReelEffect,
      visualEffect: (clip.visualEffect || 'none') as ReelVisualEffect,
      transition: clip.transition as ReelTransition,
      motion: clip.motion as ReelMotion,
      intensity: clip.intensity,
      textLayers: clip.textLayers.slice(0, MAX_TEXT_LAYERS_PER_CLIP).map((layer) => ({
        content: layer.content.replace(/\s+/g, ' ').trim().slice(0, 120),
      })),
    })),
  };
}

export function compileReelTimeline(project: ReelProject): CompiledReelTimeline {
  const clips: CompiledReelTimelineClip[] = [];
  let cursor = 0;
  project.clips.forEach((clip, index) => {
    const duration = Number.isFinite(clip.duration) ? Math.max(0, clip.duration) : 0;
    const previousDuration = index > 0 && Number.isFinite(project.clips[index - 1].duration)
      ? Math.max(0, project.clips[index - 1].duration)
      : 0;
    const requestedOverlap = Number.isFinite(clip.transitionDuration)
      ? Math.max(0, clip.transitionDuration)
      : 0;
    const incomingOverlap = index === 0 || clip.transition === 'cut'
      ? 0
      : Math.min(
        requestedOverlap,
        MAX_TRANSITION_DURATION,
        previousDuration / 2,
        duration / 2,
      );
    const start = Math.max(0, cursor - incomingOverlap);
    clips.push({ clipId: clip.id, index, start, incomingOverlap });
    cursor = start + duration;
  });
  return { clips, totalDuration: cursor };
}

export function reelDuration(project: ReelProject) {
  return compileReelTimeline(project).totalDuration;
}

const REEL_MUTATION_CLAIM = /(?:\bI(?:'ve| have)?\s+(?:added|applied|changed|edited|opened|removed|reordered|restyled|set|styled|updated)\b|\b(?:added|applied|changed|edited|opened|removed|reordered|restyled|set|styled|updated)\b.{0,56}\b(?:clips?|edit|reel|timeline)\b|\b(?:clips?|edit|reel|timeline)\b.{0,56}\b(?:now (?:has|uses)|updated|ready|restyled|set to)\b|\bdone\b.{0,48}\b(?:clips?|edit|reel|timeline)\b)/i;
const RENDER_COMPLETION_CLAIM = /(?:\b(?:rendered|exported|generated)\b.{0,48}\b(?:mp4|reel|video)\b|\b(?:mp4|reel|video)\b.{0,48}\b(?:complete|exported|ready|rendered)\b)/i;

function shortCaption(caption: string) {
  const clean = caption.replace(/\s+/g, ' ').trim();
  return clean.length > 42 ? `${clean.slice(0, 39)}…` : clean;
}

export function describeReelActionReceipt(action: AppliedDirectorReelAction) {
  const clipCount = action.clipIds.length;
  const objectCount = action.objectIds.length;
  const clipTarget = clipCount ? `${clipCount} clip${clipCount === 1 ? '' : 's'}` : 'the current clip target';
  switch (action.type) {
    case 'open_reel_studio':
      return objectCount
        ? `opened Reel Studio with ${objectCount} source${objectCount === 1 ? '' : 's'}`
        : 'opened Reel Studio';
    case 'add_clips':
      return `added ${objectCount} clip${objectCount === 1 ? '' : 's'}`;
    case 'remove_clips':
      return `removed ${clipTarget}`;
    case 'reorder_clips':
      return `reordered ${clipTarget}`;
    case 'style_clips': {
      const settings = [
        action.effect ? `${action.effect} grade` : null,
        action.visualEffect ? `${action.visualEffect} visual effect` : null,
        action.transition ? `${action.transition} transition` : null,
        action.motion ? `${action.motion} motion` : null,
        action.duration !== null ? `${action.duration}s duration` : null,
        action.promotedPixelSortClipIds?.length
          ? `extended ${action.promotedPixelSortClipIds.length === 1 ? 'its' : 'their'} untouched 3.2s default to 6.4s for pixel sort`
          : null,
        action.intensity !== null ? `${action.intensity}% strength` : null,
      ].filter((value): value is string => Boolean(value));
      return `updated ${clipTarget}${settings.length ? `: ${settings.join(', ')}` : ''}`;
    }
    case 'add_text_layer':
      return `added a text layer${action.content ? ` “${shortCaption(action.content)}”` : ''}`;
    case 'update_text_layer':
      return `updated a text layer${action.content ? ` “${shortCaption(action.content)}”` : ''}`;
    case 'move_text_layer':
      return 'moved a text layer';
    case 'remove_text_layer':
      return 'removed a text layer';
    case 'set_project': {
      const settings = [
        action.aspectRatio,
        action.fps !== null ? `${action.fps} fps` : null,
        action.quality ? `${action.quality} quality` : null,
      ].filter((value): value is string => Boolean(value));
      return `set the reel${settings.length ? ` to ${settings.join(', ')}` : ''}`;
    }
    case 'request_render':
      return 'prepared a local render request; device confirmation is still required';
  }
}

export function reconcileReelActionMessage(
  message: string,
  requestedActionCount: number,
  appliedActions: AppliedDirectorReelAction[],
  reelContextActive = false,
  visualEffectSubstitutionNotices: readonly string[] = [],
) {
  const requested = Math.max(0, requestedActionCount);
  const skipped = Math.max(0, requested - appliedActions.length);

  if (requested > 0) {
    if (!appliedActions.length) {
      const compatibility = visualEffectSubstitutionNotices.length
        ? ` ${visualEffectSubstitutionNotices.join(' ')}`
        : '';
      return `Nothing changed. The requested timeline targets were stale, unsupported, or already matched the current edit.${compatibility}`;
    }
    const receipt = `Applied locally: ${appliedActions.map(describeReelActionReceipt).join('; ')}.`;
    const reconciled = skipped > 0
      ? `${receipt} Skipped ${skipped} stale or no-op request${skipped === 1 ? '' : 's'} so the timeline stayed safe.`
      : receipt;
    return visualEffectSubstitutionNotices.length
      ? `${reconciled} Compatibility update: ${visualEffectSubstitutionNotices.join(' ')}`
      : reconciled;
  }
  if (RENDER_COMPLETION_CLAIM.test(message)) {
    return 'No video was rendered. Rendering only starts after a validated request opens Reel Studio and you confirm it on this device.';
  }
  if (REEL_MUTATION_CLAIM.test(message)) {
    return 'I did not change the reel because no executable reel action was returned.';
  }
  if (reelContextActive) {
    return `No local reel changes were applied this turn. ${message}`;
  }
  return message;
}
