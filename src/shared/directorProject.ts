import { z } from 'zod';
import {
  ContinuityReportSchema,
  DirectionContractSchema,
  DirectorModelSchema,
  DirectorResponseSchema,
  InheritanceChannelSchema,
  MAX_TEXT_LAYERS_PER_CLIP,
  ReelAspectRatioSchema,
  ReelQualitySchema,
  StorySequenceSchema,
  TextLayerSchema,
  VisualSummarySchema,
} from './directorSchemas';
import { resolveReelVisualEffect } from './reelVisualEffects';
import { migrateCaptionToTextLayer } from './textLayers';

export const DIRECTOR_PROJECT_FILE_VERSION = 2;
export const MAX_DIRECTOR_PROJECT_JSON_BYTES = 5 * 1_048_576;
export const MAX_DIRECTOR_PROJECT_MESSAGES = 120;
export const LOCAL_MEDIA_REFERENCE_PREFIX = 'local-media:';

export type DirectorLocalMediaTarget = 'object' | 'clip';

export function createDirectorLocalMediaReference(
  target: DirectorLocalMediaTarget,
  id: string,
) {
  return `${LOCAL_MEDIA_REFERENCE_PREFIX}${target}:${encodeURIComponent(id)}`;
}

export function parseDirectorLocalMediaReference(value: unknown): {
  target: DirectorLocalMediaTarget;
  id: string;
} | null {
  if (typeof value !== 'string' || !value.startsWith(LOCAL_MEDIA_REFERENCE_PREFIX)) return null;
  const remainder = value.slice(LOCAL_MEDIA_REFERENCE_PREFIX.length);
  const separator = remainder.indexOf(':');
  if (separator <= 0) return null;
  const target = remainder.slice(0, separator);
  if (target !== 'object' && target !== 'clip') return null;
  try {
    const id = decodeURIComponent(remainder.slice(separator + 1));
    return id ? { target, id } : null;
  } catch {
    return null;
  }
}

export function isDirectorLocalMediaReference(
  value: unknown,
  target?: DirectorLocalMediaTarget,
) {
  const reference = parseDirectorLocalMediaReference(value);
  return Boolean(reference && (!target || reference.target === target));
}

export const DirectorProjectCanvasModeSchema = z.enum([
  'inspect',
  'inherit',
  'combine',
  'create',
  'animate',
  'export',
]);

export const DirectorProjectCanvasObjectSchema = z.object({
  id: z.string().max(160),
  assetId: z.string().max(160).optional(),
  title: z.string().max(240),
  subtitle: z.string().max(1_000),
  kind: z.enum(['reference', 'upload', 'created', 'contract', 'beat']),
  source: z.enum(['UPLOAD', 'CREATED', 'CONTRACT', 'STORY']),
  imageUrl: z.string().max(20_000).optional(),
  previewUrl: z.string().max(20_000).optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict(),
  inherit: z.array(InheritanceChannelSchema).max(8),
  locks: z.array(z.string().max(240)).max(20),
  summary: VisualSummarySchema,
}).strict();

export const DirectorProjectChatTurnSchema = z.object({
  id: z.string().max(160),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(20_000),
  label: z.string().max(240).optional(),
  error: z.boolean().optional(),
  response: DirectorResponseSchema.optional(),
}).strict();

export const DirectorProjectReelClipSchema = z.object({
  id: z.string().max(160),
  objectId: z.string().max(160).nullable(),
  title: z.string().max(240),
  imageUrl: z.string().max(20_000),
  duration: z.number().finite(),
  durationWasUserSet: z.boolean().optional(),
  effect: z.string().min(1).max(160),
  gradeStack: z.array(z.string().min(1).max(160)).max(5).optional(),
  visualEffect: z.string().min(1).max(160).default('none'),
  visualEffectStack: z.array(z.string().min(1).max(160)).max(5).optional(),
  transition: z.string().min(1).max(160),
  transitionDuration: z.number().finite(),
  motion: z.string().min(1).max(160),
  intensity: z.number().finite(),
  pluginParams: z.record(
    z.string().min(1).max(160),
    z.record(z.string().min(1).max(80), z.unknown()),
  ).optional(),
  textLayers: z.array(TextLayerSchema).max(MAX_TEXT_LAYERS_PER_CLIP).default([]),
}).strict();

export const DirectorProjectReelSchema = z.object({
  id: z.string().max(160),
  title: z.string().max(240),
  aspectRatio: ReelAspectRatioSchema,
  fps: z.union([z.literal(24), z.literal(30)]),
  quality: ReelQualitySchema,
  clips: z.array(DirectorProjectReelClipSchema).max(16),
  selectedClipIds: z.array(z.string().max(160)).max(16),
  audio: z.null(),
  renderRequested: z.boolean(),
}).strict();

export const DirectorProjectFileSchema = z.object({
  version: z.literal(DIRECTOR_PROJECT_FILE_VERSION),
  sessionId: z.string().min(8).max(100),
  updatedAt: z.string().datetime(),
  title: z.string().min(1).max(240),
  objects: z.array(DirectorProjectCanvasObjectSchema).max(120),
  selectedIds: z.array(z.string().max(160)).max(120),
  mode: DirectorProjectCanvasModeSchema,
  goal: z.string().max(1_000),
  exclusions: z.array(z.string().max(160)).max(24),
  contract: DirectionContractSchema.nullable(),
  sequence: StorySequenceSchema.nullable(),
  continuity: ContinuityReportSchema.nullable(),
  reelProject: DirectorProjectReelSchema.nullable(),
  reelOpen: z.boolean(),
  visibleSearch: z.null(),
  messages: z.array(DirectorProjectChatTurnSchema).max(MAX_DIRECTOR_PROJECT_MESSAGES),
  model: DirectorModelSchema,
  localMediaOmitted: z.number().int().min(0).max(256),
}).strict();

export type DirectorProjectCanvasMode = z.infer<typeof DirectorProjectCanvasModeSchema>;
export type DirectorProjectCanvasObject = z.infer<typeof DirectorProjectCanvasObjectSchema>;
export type DirectorProjectChatTurn = z.infer<typeof DirectorProjectChatTurnSchema>;
export type DirectorProjectReelClip = z.infer<typeof DirectorProjectReelClipSchema>;
export type DirectorProjectReel = z.infer<typeof DirectorProjectReelSchema>;
export type DirectorProjectFile = z.infer<typeof DirectorProjectFileSchema>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Upgrade retired visual-effect ids before strict project validation. */
function migratePersistedVisualEffects(value: unknown) {
  const project = record(value);
  const reelProject = record(project?.reelProject);
  if (!project || !reelProject || !Array.isArray(reelProject.clips)) return value;
  const notices: string[] = [];
  const resolvePersistedEffect = (rawEffect: unknown) => {
    const legacy = resolveReelVisualEffect(rawEffect);
    if (legacy) return legacy;
    return typeof rawEffect === 'string' && rawEffect.length > 0 && rawEffect.length <= 160
      ? { id: rawEffect, notice: null, retiredId: null }
      : null;
  };
  const clips = reelProject.clips.map((rawClip) => {
    const clip = record(rawClip);
    if (!clip) return rawClip;
    const base = resolvePersistedEffect(clip.visualEffect);
    if (base?.notice && !notices.includes(base.notice)) notices.push(base.notice);
    const hasStack = Array.isArray(clip.visualEffectStack);
    const stack = hasStack
      ? (clip.visualEffectStack as unknown[]).flatMap((rawEffect) => {
        const resolution = resolvePersistedEffect(rawEffect);
        if (resolution?.notice && !notices.includes(resolution.notice)) {
          notices.push(resolution.notice);
        }
        return resolution && resolution.id !== 'none' ? [resolution.id] : [];
      }).filter((effect, index, effects) => effects.indexOf(effect) === index).slice(0, 5)
      : [];
    if (!base && !hasStack) return rawClip;
    return {
      ...clip,
      visualEffect: hasStack ? stack[0] || 'none' : base?.id ?? clip.visualEffect,
      ...(hasStack ? { visualEffectStack: stack } : {}),
    };
  });
  if (!notices.length) return { ...project, reelProject: { ...reelProject, clips } };
  const messages = Array.isArray(project.messages) ? project.messages : [];
  const receiptId = `visual-effect-migration-v2-${String(project.sessionId || 'project')}`.slice(0, 160);
  const hasReceipt = messages.some((message) => record(message)?.id === receiptId);
  const migratedMessages = hasReceipt ? messages : [
    ...messages.slice(-(MAX_DIRECTOR_PROJECT_MESSAGES - 1)),
    {
      id: receiptId,
      role: 'assistant',
      label: 'Restored project update',
      text: `Restored project update: ${notices.join(' ')}`,
    },
  ];
  return {
    ...project,
    reelProject: { ...reelProject, clips },
    messages: migratedMessages,
  };
}

/** Preserve saved projects after retiring previous model aliases. */
function migratePersistedDirectorModel(value: unknown) {
  const project = record(value);
  if (!project) return value;
  const model = project.model === 'gpt-5.6-sol'
    ? 'gpt-5.4'
    : project.model === 'gpt-5.6-terra'
      ? 'gpt-5.4-mini'
      : project.model;
  return model === project.model ? project : { ...project, model };
}

/**
 * v1 → v2: convert each clip's legacy single `caption` string into one
 * bottom-centered text layer and drop the field. Strictly version-gated so it
 * never re-runs on an already-migrated (v2) project — re-running would mint
 * duplicate layers on every load/save. Runs for the active file, history
 * entries, and imported files (all flow through here).
 */
function migratePersistedTextLayers(value: unknown) {
  const project = record(value);
  if (!project || project.version !== 1) return value;
  const reelProject = record(project.reelProject);
  const clips = reelProject && Array.isArray(reelProject.clips) ? reelProject.clips : null;
  const migratedClips = clips?.map((rawClip) => {
    const clip = record(rawClip);
    if (!clip) return rawClip;
    const { caption, ...rest } = clip;
    const existing = Array.isArray(clip.textLayers) ? clip.textLayers : [];
    if (existing.length > 0 || typeof caption !== 'string' || !caption.trim()) {
      return { ...rest, textLayers: existing };
    }
    const duration = typeof clip.duration === 'number' && Number.isFinite(clip.duration) ? clip.duration : 5;
    const clipId = typeof clip.id === 'string' ? clip.id : 'clip';
    return { ...rest, textLayers: [migrateCaptionToTextLayer(caption, clipId, duration)] };
  });
  return {
    ...project,
    version: 2,
    ...(reelProject && migratedClips
      ? { reelProject: { ...reelProject, clips: migratedClips } }
      : {}),
  };
}

export function migrateDirectorProjectValue(value: unknown) {
  return migratePersistedTextLayers(
    migratePersistedDirectorModel(migratePersistedVisualEffects(value)),
  );
}

export function safeParseDirectorProjectFile(value: unknown) {
  return DirectorProjectFileSchema.safeParse(migrateDirectorProjectValue(value));
}

export type DirectorProjectFileErrorCode =
  | 'json_too_large'
  | 'malformed_json'
  | 'schema_invalid';

export class DirectorProjectFileError extends Error {
  constructor(
    message: string,
    readonly code: DirectorProjectFileErrorCode,
    readonly issues?: z.core.$ZodIssue[],
  ) {
    super(message);
    this.name = 'DirectorProjectFileError';
  }
}

export function parseDirectorProjectFile(value: unknown): DirectorProjectFile {
  const parsed = safeParseDirectorProjectFile(value);
  if (parsed.success) return parsed.data;
  throw new DirectorProjectFileError(
    'Project JSON does not match the Director project-file schema.',
    'schema_invalid',
    parsed.error.issues,
  );
}

function jsonBytes(value: string) {
  if (value.length > MAX_DIRECTOR_PROJECT_JSON_BYTES) return value.length;
  return new TextEncoder().encode(value).byteLength;
}

export function parseDirectorProjectJson(text: string): DirectorProjectFile {
  if (jsonBytes(text) > MAX_DIRECTOR_PROJECT_JSON_BYTES) {
    throw new DirectorProjectFileError(
      `Project JSON exceeds the ${MAX_DIRECTOR_PROJECT_JSON_BYTES}-byte limit.`,
      'json_too_large',
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new DirectorProjectFileError('Project JSON is not valid JSON.', 'malformed_json');
  }
  return parseDirectorProjectFile(value);
}

export function stringifyDirectorProjectFile(project: DirectorProjectFile) {
  const parsed = parseDirectorProjectFile(project);
  const json = `${JSON.stringify(parsed, null, 2)}\n`;
  if (jsonBytes(json) > MAX_DIRECTOR_PROJECT_JSON_BYTES) {
    throw new DirectorProjectFileError(
      `Project JSON exceeds the ${MAX_DIRECTOR_PROJECT_JSON_BYTES}-byte limit.`,
      'json_too_large',
    );
  }
  return json;
}
