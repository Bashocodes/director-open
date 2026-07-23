import { z } from 'zod';
import {
  ContinuityReportSchema,
  DEFAULT_DIRECTOR_MODEL,
  DirectionContractSchema,
  DirectorModelSchema,
  DirectorResponseSchema,
  InheritanceChannelSchema,
  ReelAspectRatioSchema,
  ReelEffectSchema,
  ReelMotionSchema,
  ReelQualitySchema,
  ReelTransitionSchema,
  ReelVisualEffectSchema,
  StorySequenceSchema,
  VisualSummarySchema,
} from '../../shared/directorSchemas';
import { resolveReelVisualEffect } from '../../shared/reelVisualEffects';
import type { ReelProject } from './reel/types';
import type { CanvasMode, CanvasObject, ChatTurn } from './types';

const ACTIVE_PROJECT_KEY = 'director-open.active-project.v1';
const PROJECT_HISTORY_KEY = 'director-open.project-history.v1';
const GPT_5_4_DEFAULT_MIGRATION_KEY = 'director-open.default-model.gpt-5.4.v1';
const STORAGE_VERSION = 1;
const MAX_HISTORY_ENTRIES = 8;
const MAX_PERSISTED_MESSAGES = 120;

const CanvasModeSchema = z.enum(['inspect', 'inherit', 'combine', 'create', 'animate', 'export']);
const CanvasObjectSchema = z.object({
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

const ChatTurnSchema = z.object({
  id: z.string().max(160),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(20_000),
  label: z.string().max(240).optional(),
  error: z.boolean().optional(),
  response: DirectorResponseSchema.optional(),
}).strict();

const ReelClipSchema = z.object({
  id: z.string().max(160),
  objectId: z.string().max(160).nullable(),
  title: z.string().max(240),
  imageUrl: z.string().max(20_000),
  duration: z.number().finite(),
  durationWasUserSet: z.boolean().optional(),
  effect: ReelEffectSchema,
  gradeStack: z.array(ReelEffectSchema).max(5).optional(),
  visualEffect: ReelVisualEffectSchema.default('none'),
  visualEffectStack: z.array(ReelVisualEffectSchema).max(5).optional(),
  transition: ReelTransitionSchema,
  transitionDuration: z.number().finite(),
  motion: ReelMotionSchema,
  intensity: z.number().finite(),
  caption: z.string().max(180),
}).strict();

const ReelProjectSchema = z.object({
  id: z.string().max(160),
  title: z.string().max(240),
  aspectRatio: ReelAspectRatioSchema,
  fps: z.union([z.literal(24), z.literal(30)]),
  quality: ReelQualitySchema,
  clips: z.array(ReelClipSchema).max(16),
  selectedClipIds: z.array(z.string().max(160)).max(16),
  audio: z.null(),
  renderRequested: z.boolean(),
}).strict();

const PersistedProjectSchema = z.object({
  version: z.literal(STORAGE_VERSION),
  sessionId: z.string().min(8).max(100),
  updatedAt: z.string().datetime(),
  title: z.string().min(1).max(240),
  objects: z.array(CanvasObjectSchema).max(120),
  selectedIds: z.array(z.string().max(160)).max(120),
  mode: CanvasModeSchema,
  goal: z.string().max(1_000),
  exclusions: z.array(z.string().max(160)).max(24),
  contract: DirectionContractSchema.nullable(),
  sequence: StorySequenceSchema.nullable(),
  continuity: ContinuityReportSchema.nullable(),
  reelProject: ReelProjectSchema.nullable(),
  reelOpen: z.boolean(),
  visibleSearch: z.null(),
  messages: z.array(ChatTurnSchema).max(MAX_PERSISTED_MESSAGES),
  model: DirectorModelSchema,
  localMediaOmitted: z.number().int().min(0).max(32),
}).strict();

const HistoryEntrySchema = z.object({
  id: z.string().min(1).max(240),
  project: PersistedProjectSchema,
}).strict();
const HistorySchema = z.array(HistoryEntrySchema).max(MAX_HISTORY_ENTRIES);

type PersistedProjectData = z.infer<typeof PersistedProjectSchema>;

export type DirectorPersistedProject = Omit<
  PersistedProjectData,
  'objects' | 'mode' | 'visibleSearch' | 'messages' | 'reelProject'
> & {
  objects: CanvasObject[];
  mode: CanvasMode;
  visibleSearch: null;
  messages: ChatTurn[];
  reelProject: ReelProject | null;
};

export type DirectorHistorySummary = {
  id: string;
  title: string;
  updatedAt: string;
  objectCount: number;
  messageCount: number;
};

type ProjectInput = Omit<
  DirectorPersistedProject,
  'version' | 'updatedAt' | 'title' | 'localMediaOmitted' | 'reelProject'
> & { reelProject: ReelProject | null };

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Upgrade retired visual-effect ids before the canonical persistence schema sees them. */
function migratePersistedVisualEffects(value: unknown) {
  const project = record(value);
  const reelProject = record(project?.reelProject);
  if (!project || !reelProject || !Array.isArray(reelProject.clips)) return value;
  const notices: string[] = [];
  const clips = reelProject.clips.map((rawClip) => {
    const clip = record(rawClip);
    if (!clip) return rawClip;
    const base = resolveReelVisualEffect(clip.visualEffect);
    if (base?.notice && !notices.includes(base.notice)) notices.push(base.notice);
    const hasStack = Array.isArray(clip.visualEffectStack);
    const stack = hasStack
      ? (clip.visualEffectStack as unknown[]).flatMap((rawEffect) => {
        const resolution = resolveReelVisualEffect(rawEffect);
        if (resolution?.notice && !notices.includes(resolution.notice)) notices.push(resolution.notice);
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
    ...messages.slice(-(MAX_PERSISTED_MESSAGES - 1)),
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

/** Preserve saved projects after retiring the previous OpenAI picker aliases. */
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

function migratePersistedProject(value: unknown) {
  return migratePersistedDirectorModel(migratePersistedVisualEffects(value));
}

function parseProject(value: string | null) {
  if (!value) return null;
  try {
    const parsed = PersistedProjectSchema.safeParse(migratePersistedProject(JSON.parse(value)));
    return parsed.success ? parsed.data as DirectorPersistedProject : null;
  } catch {
    return null;
  }
}

function promoteLegacyActiveDefault(
  local: Storage | null,
  project: DirectorPersistedProject | null,
) {
  if (!local) return project;
  try {
    if (local.getItem(GPT_5_4_DEFAULT_MIGRATION_KEY) === '1') return project;
  } catch {
    return project;
  }
  if (project?.model === 'gemini-3.5-flash') {
    const migrated = { ...project, model: DEFAULT_DIRECTOR_MODEL };
    try {
      local.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(PersistedProjectSchema.parse(migrated)));
      local.setItem(GPT_5_4_DEFAULT_MIGRATION_KEY, '1');
    } catch {
      // The in-memory upgrade is still safe when storage becomes unavailable.
    }
    return migrated;
  }
  try {
    local.setItem(GPT_5_4_DEFAULT_MIGRATION_KEY, '1');
  } catch {
    return project;
  }
  return project;
}

function readHistory() {
  const local = storage();
  if (!local) return [];
  try {
    const raw = JSON.parse(local.getItem(PROJECT_HISTORY_KEY) || '[]');
    const migrated = Array.isArray(raw)
      ? raw.map((entry) => {
        const candidate = record(entry);
        return candidate ? { ...candidate, project: migratePersistedProject(candidate.project) } : entry;
      })
      : raw;
    const parsed = HistorySchema.safeParse(migrated);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function restorableMediaUrl(url: string | undefined) {
  if (!url || url.startsWith('blob:')) return false;
  return url.startsWith('/') || url.startsWith('https://') || url.startsWith('http://')
    || (url.startsWith('data:image/') && url.length <= 20_000);
}

function projectTitle(input: ProjectInput) {
  return (input.sequence?.title || input.contract?.title
    || input.objects.find((object) => ['reference', 'upload', 'created'].includes(object.kind))?.title
    || 'Untitled Director project').slice(0, 240);
}

export function makePersistableDirectorProject(input: ProjectInput): DirectorPersistedProject | null {
  let localMediaOmitted = 0;
  const objects = input.objects.map((object) => {
    if (!object.imageUrl || restorableMediaUrl(object.imageUrl)) return object;
    localMediaOmitted += 1;
    const { imageUrl: _imageUrl, ...rest } = object;
    return rest;
  });
  const reelProject = input.reelProject ? (() => {
    const clips = input.reelProject!.clips.flatMap((clip) => {
      if (clip.sourceFile || !restorableMediaUrl(clip.imageUrl)) {
        localMediaOmitted += 1;
        return [];
      }
      const { sourceFile: _sourceFile, ...persisted } = clip;
      return [persisted];
    });
    if (input.reelProject!.audio) localMediaOmitted += 1;
    const knownClipIds = new Set(clips.map((clip) => clip.id));
    return {
      ...input.reelProject!,
      clips,
      selectedClipIds: input.reelProject!.selectedClipIds.filter((id) => knownClipIds.has(id)),
      audio: null,
    };
  })() : null;
  const selectedIds = input.selectedIds.filter((id) => objects.some((object) => object.id === id));
  const candidate = {
    ...input,
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    title: projectTitle(input),
    objects,
    selectedIds,
    reelProject,
    reelOpen: Boolean(input.reelOpen && reelProject),
    messages: input.messages.slice(-MAX_PERSISTED_MESSAGES),
    localMediaOmitted,
  };
  const parsed = PersistedProjectSchema.safeParse(candidate);
  return parsed.success ? parsed.data as DirectorPersistedProject : null;
}

export function loadActiveDirectorProject() {
  const local = storage();
  return promoteLegacyActiveDefault(local, parseProject(local?.getItem(ACTIVE_PROJECT_KEY) || null));
}

export function saveActiveDirectorProject(project: DirectorPersistedProject) {
  const local = storage();
  if (!local) return false;
  try {
    local.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(PersistedProjectSchema.parse(project)));
    return true;
  } catch {
    return false;
  }
}

export function clearActiveDirectorProject() {
  try {
    storage()?.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    // A restricted storage context must not prevent starting a fresh project.
  }
}

function comparableProject(project: PersistedProjectData) {
  const { updatedAt: _updatedAt, ...rest } = project;
  return JSON.stringify(rest);
}

export function archiveDirectorProject(project: DirectorPersistedProject) {
  const local = storage();
  if (!local || (project.objects.length === 0 && project.messages.length <= 1)) return listDirectorHistory();
  const parsed = PersistedProjectSchema.safeParse(project);
  if (!parsed.success) return listDirectorHistory();
  const safeProject = parsed.data;
  const current = readHistory();
  const duplicate = current.find((entry) => comparableProject(entry.project) === comparableProject(safeProject));
  const entry = duplicate || { id: `${safeProject.sessionId}-${safeProject.updatedAt}`, project: safeProject };
  const history = [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, MAX_HISTORY_ENTRIES);
  try {
    local.setItem(PROJECT_HISTORY_KEY, JSON.stringify(history));
  } catch {
    return listDirectorHistory();
  }
  return history.map(toHistorySummary);
}

function toHistorySummary(entry: z.infer<typeof HistoryEntrySchema>): DirectorHistorySummary {
  return {
    id: entry.id,
    title: entry.project.title,
    updatedAt: entry.project.updatedAt,
    objectCount: entry.project.objects.length,
    messageCount: entry.project.messages.length,
  };
}

export function listDirectorHistory() {
  return readHistory().map(toHistorySummary);
}

export function loadDirectorHistoryProject(id: string) {
  const entry = readHistory().find((item) => item.id === id);
  return entry?.project as DirectorPersistedProject | undefined;
}

export function deleteDirectorHistoryProject(id: string) {
  const local = storage();
  const history = readHistory().filter((entry) => entry.id !== id);
  try {
    local?.setItem(PROJECT_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // A failed cleanup must not take down the active Director session.
  }
  return history.map(toHistorySummary);
}
