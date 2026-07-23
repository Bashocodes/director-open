import { z } from 'zod';
import { DEFAULT_DIRECTOR_MODEL } from '../../shared/directorSchemas';
import {
  createDirectorLocalMediaReference,
  DIRECTOR_PROJECT_FILE_VERSION,
  DirectorProjectFileSchema,
  isDirectorLocalMediaReference,
  MAX_DIRECTOR_PROJECT_MESSAGES,
  migrateDirectorProjectValue,
  safeParseDirectorProjectFile,
  type DirectorProjectFile,
} from '../../shared/directorProject';
import type { ReelProject } from './reel/types';
import type { CanvasMode, CanvasObject, ChatTurn } from './types';

const ACTIVE_PROJECT_KEY = 'director-open.active-project.v1';
const PROJECT_HISTORY_KEY = 'director-open.project-history.v1';
const GPT_5_4_DEFAULT_MIGRATION_KEY = 'director-open.default-model.gpt-5.4.v1';
const MAX_HISTORY_ENTRIES = 8;
const DATABASE_NAME = 'director-open';
const DATABASE_VERSION = 1;
const ACTIVE_PROJECT_STORE = 'active-project';
const ACTIVE_PROJECT_RECORD_KEY = 'active';

const HistoryEntrySchema = z.object({
  id: z.string().min(1).max(240),
  project: DirectorProjectFileSchema,
}).strict();
const HistorySchema = z.array(HistoryEntrySchema).max(MAX_HISTORY_ENTRIES);

type PersistedProjectData = DirectorProjectFile;

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

type RuntimeMediaSource = Pick<ProjectInput, 'objects' | 'reelProject'>;

type StoredMediaBlob = {
  target: 'object' | 'clip' | 'audio';
  id: string;
  bytes: ArrayBuffer;
  name: string;
  type: string;
  lastModified: number;
};

type IndexedDbProjectRecord = {
  key: typeof ACTIVE_PROJECT_RECORD_KEY;
  project: DirectorPersistedProject;
  media: StoredMediaBlob[];
};

export type DirectorPersistenceResult = 'saved' | 'quota' | 'unavailable';

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

function parseProject(value: string | null) {
  if (!value) return null;
  try {
    return parseProjectValue(JSON.parse(value));
  } catch {
    return null;
  }
}

function parseProjectValue(value: unknown) {
  const parsed = safeParseDirectorProjectFile(value);
  return parsed.success ? parsed.data as DirectorPersistedProject : null;
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
      local.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(DirectorProjectFileSchema.parse(migrated)));
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
        return candidate
          ? { ...candidate, project: migrateDirectorProjectValue(candidate.project) }
          : entry;
      })
      : raw;
    const parsed = HistorySchema.safeParse(migrated);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function generatedMediaUrl(url: string | undefined) {
  return Boolean(url?.startsWith('data:image/') && url.length <= 20_000);
}

function projectTitle(input: ProjectInput) {
  return (input.sequence?.title || input.contract?.title
    || input.objects.find((object) => ['reference', 'upload', 'created'].includes(object.kind))?.title
    || 'Untitled Director project').slice(0, 240);
}

export function makePersistableDirectorProject(input: ProjectInput): DirectorPersistedProject | null {
  let localMediaOmitted = 0;
  const objects = input.objects.map((object) => {
    const { sourceFile, previewUrl: _previewUrl, ...serializable } = object;
    if (sourceFile) {
      localMediaOmitted += 1;
      return {
        ...serializable,
        imageUrl: createDirectorLocalMediaReference('object', object.id),
      };
    }
    if (!object.imageUrl || generatedMediaUrl(object.imageUrl)) return serializable;
    localMediaOmitted += 1;
    const { imageUrl: _imageUrl, ...withoutMedia } = serializable;
    return withoutMedia;
  });
  const reelProject = input.reelProject ? (() => {
    const clips = input.reelProject!.clips.flatMap((clip) => {
      const { sourceFile, ...serializable } = clip;
      if (sourceFile) {
        localMediaOmitted += 1;
        return [{
          ...serializable,
          imageUrl: createDirectorLocalMediaReference('clip', clip.id),
        }];
      }
      if (generatedMediaUrl(clip.imageUrl)) return [serializable];
      localMediaOmitted += 1;
      return [];
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
    version: DIRECTOR_PROJECT_FILE_VERSION,
    updatedAt: new Date().toISOString(),
    title: projectTitle(input),
    objects,
    selectedIds,
    reelProject,
    reelOpen: Boolean(input.reelOpen && reelProject),
    messages: input.messages.slice(-MAX_DIRECTOR_PROJECT_MESSAGES),
    localMediaOmitted,
  };
  const parsed = DirectorProjectFileSchema.safeParse(candidate);
  return parsed.success ? parsed.data as DirectorPersistedProject : null;
}

export function loadActiveDirectorProject() {
  const local = storage();
  const project = promoteLegacyActiveDefault(local, parseProject(local?.getItem(ACTIVE_PROJECT_KEY) || null));
  return project ? withoutUnavailableMedia(project) : null;
}

export function saveActiveDirectorProject(project: DirectorPersistedProject) {
  const local = storage();
  if (!local) return false;
  try {
    local.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(DirectorProjectFileSchema.parse(project)));
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

function withoutUnavailableMedia(project: DirectorPersistedProject) {
  let missing = project.localMediaOmitted;
  const objects = project.objects.map((object) => {
    if (!object.imageUrl || generatedMediaUrl(object.imageUrl)) return object;
    missing += project.localMediaOmitted ? 0 : 1;
    const { imageUrl: _imageUrl, previewUrl: _previewUrl, ...withoutMedia } = object;
    return withoutMedia;
  });
  const reelProject = project.reelProject ? (() => {
    const clips = project.reelProject!.clips.filter((clip) => {
      const available = generatedMediaUrl(clip.imageUrl);
      if (!available && !project.localMediaOmitted) missing += 1;
      return available;
    });
    const clipIds = new Set(clips.map((clip) => clip.id));
    return {
      ...project.reelProject!,
      clips,
      selectedClipIds: project.reelProject!.selectedClipIds.filter((id) => clipIds.has(id)),
      audio: null,
    };
  })() : null;
  return {
    ...project,
    objects,
    reelProject,
    reelOpen: Boolean(project.reelOpen && reelProject),
    localMediaOmitted: missing,
  };
}

function databaseFactory() {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
}

function openDirectorDatabase() {
  const factory = databaseFactory();
  if (!factory) return Promise.resolve<IDBDatabase | null>(null);
  return new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ACTIVE_PROJECT_STORE)) {
        database.createObjectStore(ACTIVE_PROJECT_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB is unavailable.'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
  });
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function readFileBytes(file: File) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.readAsArrayBuffer(file);
  });
}

async function storedBlob(target: StoredMediaBlob['target'], id: string, file: File): Promise<StoredMediaBlob> {
  return {
    target,
    id,
    bytes: await readFileBytes(file),
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
  };
}

async function localMedia(runtime: RuntimeMediaSource) {
  const pending: Array<Promise<StoredMediaBlob>> = [];
  const objectFiles = new Map(runtime.objects.flatMap((object) => (
    object.sourceFile ? [[object.id, object.sourceFile] as const] : []
  )));
  for (const object of runtime.objects) {
    if (object.sourceFile) pending.push(storedBlob('object', object.id, object.sourceFile));
  }
  for (const clip of runtime.reelProject?.clips || []) {
    const objectFile = clip.objectId ? objectFiles.get(clip.objectId) : undefined;
    const sharesObjectMedia = Boolean(
      clip.sourceFile
      && objectFile
      && clip.sourceFile.name === objectFile.name
      && clip.sourceFile.size === objectFile.size
      && clip.sourceFile.type === objectFile.type
      && clip.sourceFile.lastModified === objectFile.lastModified,
    );
    if (clip.sourceFile && !sharesObjectMedia) {
      pending.push(storedBlob('clip', clip.id, clip.sourceFile));
    }
  }
  if (runtime.reelProject?.audio) {
    pending.push(storedBlob('audio', 'audio', runtime.reelProject.audio.sourceFile));
  }
  return Promise.all(pending);
}

function quotaExceeded(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'QuotaExceededError'
    : Boolean(error && typeof error === 'object' && 'name' in error
      && (error as { name?: unknown }).name === 'QuotaExceededError');
}

export async function saveActiveDirectorProjectToIndexedDb(
  project: DirectorPersistedProject,
  runtime: RuntimeMediaSource,
  signal?: AbortSignal,
): Promise<DirectorPersistenceResult> {
  const parsed = parseProjectValue(project);
  if (!parsed || signal?.aborted) return 'unavailable';
  let database: IDBDatabase | null = null;
  try {
    database = await openDirectorDatabase();
    if (!database || signal?.aborted) return 'unavailable';
    const media = await localMedia(runtime);
    if (signal?.aborted) return 'unavailable';
    const transaction = database.transaction(ACTIVE_PROJECT_STORE, 'readwrite');
    transaction.objectStore(ACTIVE_PROJECT_STORE).put({
      key: ACTIVE_PROJECT_RECORD_KEY,
      project: parsed,
      media,
    } satisfies IndexedDbProjectRecord);
    await transactionDone(transaction);
    return 'saved';
  } catch (error) {
    return quotaExceeded(error) ? 'quota' : 'unavailable';
  } finally {
    database?.close();
  }
}

function restoreFile(media: StoredMediaBlob) {
  return new File([media.bytes], media.name, {
    type: media.type,
    lastModified: media.lastModified,
  });
}

function hydrateIndexedDbProject(project: DirectorPersistedProject, media: StoredMediaBlob[]) {
  const mediaByTarget = new Map(media.map((item) => [`${item.target}:${item.id}`, item]));
  const createdUrls: string[] = [];
  let missing = 0;
  try {
    const objects = project.objects.map((object) => {
      if (!isDirectorLocalMediaReference(object.imageUrl, 'object')) {
        if (!object.imageUrl || generatedMediaUrl(object.imageUrl)) return object;
        missing += 1;
        const { imageUrl: _imageUrl, previewUrl: _previewUrl, ...withoutMedia } = object;
        return withoutMedia;
      }
      const stored = mediaByTarget.get(`object:${object.id}`);
      if (!stored) {
        missing += 1;
        const { imageUrl: _imageUrl, previewUrl: _previewUrl, ...withoutMedia } = object;
        return withoutMedia;
      }
      const sourceFile = restoreFile(stored);
      const imageUrl = URL.createObjectURL(sourceFile);
      createdUrls.push(imageUrl);
      return { ...object, imageUrl, sourceFile };
    });

    const reelProject = project.reelProject ? (() => {
      const clips = project.reelProject!.clips.flatMap((clip) => {
        if (!isDirectorLocalMediaReference(clip.imageUrl, 'clip')) {
          if (generatedMediaUrl(clip.imageUrl)) return [clip];
          missing += 1;
          return [];
        }
        const stored = mediaByTarget.get(`clip:${clip.id}`)
          || (clip.objectId ? mediaByTarget.get(`object:${clip.objectId}`) : undefined);
        if (!stored) {
          missing += 1;
          return [];
        }
        const sourceFile = restoreFile(stored);
        const imageUrl = URL.createObjectURL(sourceFile);
        createdUrls.push(imageUrl);
        return [{ ...clip, imageUrl, sourceFile }];
      });
      const selectedClipIds = new Set(clips.map((clip) => clip.id));
      const storedAudio = mediaByTarget.get('audio:audio');
      const audio = storedAudio ? (() => {
        const sourceFile = restoreFile(storedAudio);
        const url = URL.createObjectURL(sourceFile);
        createdUrls.push(url);
        return { name: sourceFile.name, sourceFile, url };
      })() : null;
      return {
        ...project.reelProject!,
        clips,
        selectedClipIds: project.reelProject!.selectedClipIds.filter((id) => selectedClipIds.has(id)),
        audio,
      };
    })() : null;

    return {
      ...project,
      objects,
      reelProject,
      reelOpen: Boolean(project.reelOpen && reelProject),
      localMediaOmitted: missing,
    };
  } catch (error) {
    createdUrls.forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
}

export async function loadActiveDirectorProjectFromIndexedDb() {
  let database: IDBDatabase | null = null;
  try {
    database = await openDirectorDatabase();
    if (!database) return null;
    const transaction = database.transaction(ACTIVE_PROJECT_STORE, 'readonly');
    const value = await requestValue(
      transaction.objectStore(ACTIVE_PROJECT_STORE).get(ACTIVE_PROJECT_RECORD_KEY),
    ) as IndexedDbProjectRecord | undefined;
    await transactionDone(transaction);
    if (!value || !Array.isArray(value.media)) return null;
    const project = parseProjectValue(value.project);
    return project ? hydrateIndexedDbProject(project, value.media) : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function clearActiveDirectorProjectFromIndexedDb() {
  let database: IDBDatabase | null = null;
  try {
    database = await openDirectorDatabase();
    if (!database) return;
    const transaction = database.transaction(ACTIVE_PROJECT_STORE, 'readwrite');
    transaction.objectStore(ACTIVE_PROJECT_STORE).delete(ACTIVE_PROJECT_RECORD_KEY);
    await transactionDone(transaction);
  } catch {
    // Restricted or unavailable IndexedDB must not block a fresh project.
  } finally {
    database?.close();
  }
}

function comparableProject(project: PersistedProjectData) {
  const { updatedAt: _updatedAt, ...rest } = project;
  return JSON.stringify(rest);
}

export function archiveDirectorProject(project: DirectorPersistedProject) {
  const local = storage();
  if (!local || (project.objects.length === 0 && project.messages.length <= 1)) return listDirectorHistory();
  const parsed = DirectorProjectFileSchema.safeParse(project);
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
  return entry ? withoutUnavailableMedia(entry.project as DirectorPersistedProject) : undefined;
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
