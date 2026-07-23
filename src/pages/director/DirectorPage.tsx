import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DIRECTOR_MODEL,
  type ContinuityReport,
  type DirectionContract,
  type DirectorModel,
  type DirectorResponse,
  type InheritanceChannel,
  type StorySequence,
} from '../../shared/directorSchemas';
import {
  isDirectorLocalMediaReference,
  MAX_DIRECTOR_PROJECT_JSON_BYTES,
  parseDirectorProjectJson,
  stringifyDirectorProjectFile,
  type DirectorProjectFile,
} from '../../shared/directorProject';
import { serializeDirectorContext } from '../../lib/ai/directorContext';
import {
  DIRECTOR_SYSTEM_PROMPT,
  parseDirectorAiResponse,
  splitDirectorActions,
  streamingExplanation,
  type DirectorAiProposal,
} from '../../lib/ai/directorResponse';
import { getChatProvider } from '../../lib/ai/providers';
import {
  isProviderConfigured,
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from '../../lib/ai/vault';
import { DirectorCanvas } from './components/DirectorCanvas';
import { DirectorChat } from './components/DirectorChat';
import {
  applyDirectorCanvasActions,
  type DirectorCanvasActionResult,
} from './directorActions';
import { nextReferencePosition } from './directorLayout';
import { DirectorReelStudio } from './reel/DirectorReelStudio';
import {
  applyDirectorReelActions,
  createReelProject,
  normalizeReelProject,
  reconcileReelActionMessage,
} from './reel/project';
import { revokeProjectObjectUrls, revokeRemovedProjectObjectUrls } from './reel/media';
import type { ReelProject } from './reel/types';
import {
  archiveDirectorProject,
  clearActiveDirectorProject,
  clearActiveDirectorProjectFromIndexedDb,
  deleteDirectorHistoryProject,
  listDirectorHistory,
  loadActiveDirectorProject,
  loadActiveDirectorProjectFromIndexedDb,
  loadDirectorHistoryProject,
  makePersistableDirectorProject,
  saveActiveDirectorProject,
  saveActiveDirectorProjectToIndexedDb,
  type DirectorPersistedProject,
  type DirectorPersistenceResult,
} from './directorPersistence';
import type { CanvasMode, CanvasObject, ChatTurn } from './types';
import { EMPTY_SUMMARY } from './types';
import './DirectorPage.css';

const welcome: ChatTurn = {
  id: 'director-welcome',
  role: 'assistant',
  text: 'Upload your own visual references, place them on the canvas, then tell me what each source should contribute. I can compile the direction, build the story, and turn it into a locally rendered reel with effects, motion, transitions, captions, and music.',
};

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

function revokeLocalCanvasMedia(objects: CanvasObject[], retainedUrls: ReadonlySet<string> = new Set()) {
  for (const object of objects) {
    if (object.sourceFile && object.imageUrl?.startsWith('blob:') && !retainedUrls.has(object.imageUrl)) {
      URL.revokeObjectURL(object.imageUrl);
    }
  }
}

function canvasMediaUrls(objects: CanvasObject[]) {
  return new Set(objects.flatMap((object) => (
    object.sourceFile && object.imageUrl?.startsWith('blob:') ? [object.imageUrl] : []
  )));
}

function reelMediaUrls(project: ReelProject | null) {
  return new Set([
    ...(project?.clips.flatMap((clip) => clip.sourceFile ? [clip.imageUrl] : []) || []),
    ...(project?.audio ? [project.audio.url] : []),
  ]);
}

function revokeAllDirectorMedia(
  objects: CanvasObject[],
  project: ReelProject | null,
  retainedUrls: ReadonlySet<string> = new Set(),
) {
  const urls = new Set([...canvasMediaUrls(objects), ...reelMediaUrls(project)]);
  urls.forEach((url) => {
    if (!retainedUrls.has(url)) URL.revokeObjectURL(url);
  });
}

function restoredMessages(project: DirectorPersistedProject | null, source: 'browser' | 'file' = 'browser') {
  const messages = project?.messages.length ? project.messages : [welcome];
  if (!project?.localMediaOmitted) return messages;
  return [...messages, {
    id: `local-media-restore-${project.sessionId}-${project.updatedAt}`,
    role: 'assistant' as const,
    text: `${source === 'file' ? 'Project JSON was imported' : 'Project history was restored'}, but ${project.localMediaOmitted} local media ${project.localMediaOmitted === 1 ? 'item was' : 'items were'} unavailable in browser storage. Add those local files again before rendering.`,
  }];
}

function isInlineProjectImage(url: string | undefined) {
  return Boolean(url?.startsWith('data:image/') && url.length <= 20_000);
}

/**
 * Project JSON intentionally contains media references rather than private
 * bytes. A same-session import can reconnect those references to the Files
 * already held by this browser; unresolved references are removed before any
 * preview component can attempt to load them.
 */
function reconcileImportedBrowserMedia(
  imported: DirectorProjectFile,
  currentSessionId: string,
  currentObjects: CanvasObject[],
  currentReel: ReelProject | null,
) {
  const canReuseCurrentMedia = imported.sessionId === currentSessionId;
  const currentObjectsById = new Map(currentObjects.map((object) => [object.id, object]));
  const currentClipsById = new Map((currentReel?.clips || []).map((clip) => [clip.id, clip]));
  const retainedUrls = new Set<string>();
  let missing = imported.localMediaOmitted;

  const reuse = (url: string) => {
    retainedUrls.add(url);
    missing = Math.max(0, missing - 1);
  };
  const markUnexpectedMissing = () => {
    if (imported.localMediaOmitted === 0) missing += 1;
  };

  const objects = imported.objects.map((object) => {
    if (!object.imageUrl || isInlineProjectImage(object.imageUrl)) return object;
    const current = canReuseCurrentMedia ? currentObjectsById.get(object.id) : undefined;
    if (
      isDirectorLocalMediaReference(object.imageUrl)
      && current?.sourceFile
      && current.imageUrl?.startsWith('blob:')
    ) {
      reuse(current.imageUrl);
      return { ...object, imageUrl: current.imageUrl, sourceFile: current.sourceFile };
    }
    markUnexpectedMissing();
    const { imageUrl: _imageUrl, previewUrl: _previewUrl, ...withoutMedia } = object;
    return withoutMedia;
  });

  const reelProject = imported.reelProject ? (() => {
    const clips = imported.reelProject!.clips.flatMap((clip) => {
      if (isInlineProjectImage(clip.imageUrl)) return [clip];
      const currentClip = canReuseCurrentMedia ? currentClipsById.get(clip.id) : undefined;
      const currentObject = canReuseCurrentMedia && clip.objectId
        ? currentObjectsById.get(clip.objectId)
        : undefined;
      const source = currentClip?.sourceFile && currentClip.imageUrl.startsWith('blob:')
        ? { sourceFile: currentClip.sourceFile, imageUrl: currentClip.imageUrl }
        : currentObject?.sourceFile && currentObject.imageUrl?.startsWith('blob:')
          ? { sourceFile: currentObject.sourceFile, imageUrl: currentObject.imageUrl }
          : null;
      if (isDirectorLocalMediaReference(clip.imageUrl) && source) {
        reuse(source.imageUrl);
        return [{ ...clip, ...source }];
      }
      markUnexpectedMissing();
      return [];
    });
    const availableClipIds = new Set(clips.map((clip) => clip.id));
    const audio = canReuseCurrentMedia
      && imported.reelProject!.id === currentReel?.id
      && currentReel.audio
      ? currentReel.audio
      : null;
    if (audio) {
      retainedUrls.add(audio.url);
      missing = Math.max(0, missing - 1);
    }
    return {
      ...imported.reelProject!,
      clips,
      selectedClipIds: imported.reelProject!.selectedClipIds.filter((id) => availableClipIds.has(id)),
      audio,
    };
  })() : null;

  return {
    project: {
      ...imported,
      objects,
      reelProject,
      reelOpen: Boolean(imported.reelOpen && reelProject),
      localMediaOmitted: missing,
    } satisfies DirectorPersistedProject,
    retainedUrls,
  };
}

function projectFileName(title: string) {
  const safeTitle = title
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase();
  return `${safeTitle || 'director-project'}.director.json`;
}

function readProjectFile(file: File) {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.readAsText(file);
  });
}

export function DirectorPage() {
  const [initialProject] = useState(() => loadActiveDirectorProject());
  const [objects, setObjects] = useState<CanvasObject[]>(() => initialProject?.objects || []);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => initialProject?.selectedIds || []);
  const [mode, setMode] = useState<CanvasMode>(() => initialProject?.mode || 'inspect');
  const [goal, setGoal] = useState(() => initialProject?.goal || 'Create a distinctive visual direction and turn it into a coherent six-beat story.');
  const [exclusions, setExclusions] = useState<string[]>(() => initialProject?.exclusions || []);
  const [contract, setContract] = useState<DirectionContract | null>(() => initialProject?.contract || null);
  const [sequence, setSequence] = useState<StorySequence | null>(() => initialProject?.sequence || null);
  const [continuity, setContinuity] = useState<ContinuityReport | null>(() => initialProject?.continuity || null);
  const [reelProject, setReelProject] = useState<ReelProject | null>(() => initialProject?.reelProject || null);
  const [reelOpen, setReelOpen] = useState(() => Boolean(initialProject?.reelOpen && initialProject.reelProject));
  const [messages, setMessages] = useState<ChatTurn[]>(() => restoredMessages(initialProject));
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<DirectorModel>(() => initialProject?.model || DEFAULT_DIRECTOR_MODEL);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => loadAiSettings());
  const [pendingProposal, setPendingProposal] = useState<DirectorAiProposal | null>(null);
  const [sessionId, setSessionId] = useState(() => initialProject?.sessionId || crypto.randomUUID?.() || `director-${Date.now()}`);
  const [history, setHistory] = useState(() => listDirectorHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projectFileNotice, setProjectFileNotice] = useState('');
  const [persistenceStatus, setPersistenceStatus] = useState<DirectorPersistenceResult | 'saving'>('saving');
  const [persistenceReady, setPersistenceReady] = useState(false);
  const reelProjectRef = useRef<ReelProject | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const pendingModeRef = useRef<CanvasMode>('inspect');
  const projectFileImportedRef = useRef(false);
  const persistedProjectRef = useRef<DirectorPersistedProject | null>(initialProject);
  const lastArchivedMessageIdRef = useRef(initialProject?.messages.at(-1)?.id || welcome.id);
  const liveProjectRef = useRef({ objects, selectedIds, goal, exclusions, reelProject, sequence });
  reelProjectRef.current = reelProject;
  liveProjectRef.current = { objects, selectedIds, goal, exclusions, reelProject, sequence };

  const updateReelProject = useCallback((update: ReelProject | null | ((current: ReelProject | null) => ReelProject | null)) => {
    setReelProject((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      revokeRemovedProjectObjectUrls(current, next, canvasMediaUrls(liveProjectRef.current.objects));
      reelProjectRef.current = next;
      return next;
    });
  }, []);

  const useCanvasSelectionInReel = useCallback(() => {
    const fresh = createReelProject(objects, selectedIds, newId, sequence);
    updateReelProject((current) => {
      if (!current) return fresh;
      if (!fresh.clips.length) return { ...current, renderRequested: false };
      const existingByObject = new Map(current.clips.flatMap((clip) => clip.objectId ? [[clip.objectId, clip] as const] : []));
      const clips = fresh.clips.map((clip) => existingByObject.get(clip.objectId || '') || clip);
      return normalizeReelProject({
        ...fresh,
        id: current.id,
        title: current.title,
        aspectRatio: current.aspectRatio,
        fps: current.fps,
        quality: current.quality,
        clips,
        selectedClipIds: clips.map((clip) => clip.id),
        audio: current.audio,
        renderRequested: false,
      });
    });
    setReelOpen(true);
  }, [objects, selectedIds, sequence, updateReelProject]);

  useEffect(() => {
    let active = true;
    void loadActiveDirectorProjectFromIndexedDb().then((indexedProject) => {
      if (!active || projectFileImportedRef.current) {
        if (indexedProject) {
          revokeLocalCanvasMedia(indexedProject.objects);
          revokeProjectObjectUrls(indexedProject.reelProject);
        }
        if (active) setPersistenceReady(true);
        return;
      }
      if (indexedProject) {
        revokeAllDirectorMedia(liveProjectRef.current.objects, reelProjectRef.current);
        setObjects(indexedProject.objects);
        setSelectedIds(indexedProject.selectedIds);
        setMode(indexedProject.mode);
        setGoal(indexedProject.goal);
        setExclusions(indexedProject.exclusions);
        setContract(indexedProject.contract);
        setSequence(indexedProject.sequence);
        setContinuity(indexedProject.continuity);
        setReelProject(indexedProject.reelProject);
        reelProjectRef.current = indexedProject.reelProject;
        setReelOpen(Boolean(indexedProject.reelOpen && indexedProject.reelProject));
        const nextMessages = restoredMessages(indexedProject);
        setMessages(nextMessages);
        setModel(indexedProject.model);
        setSessionId(indexedProject.sessionId);
        persistedProjectRef.current = indexedProject;
        lastArchivedMessageIdRef.current = nextMessages.at(-1)?.id || welcome.id;
      }
      setPersistenceReady(true);
    });
    return () => { active = false; };
  }, [updateReelProject]);

  useEffect(() => () => {
    requestIdRef.current += 1;
    requestRef.current?.abort();
    revokeAllDirectorMedia(liveProjectRef.current.objects, reelProjectRef.current);
  }, []);

  const selectedCount = useMemo(() => selectedIds.length, [selectedIds]);
  const referenceCount = useMemo(
    () => objects.filter((object) => ['reference', 'upload', 'created'].includes(object.kind)).length,
    [objects],
  );

  const persistedProject = useMemo(() => makePersistableDirectorProject({
    sessionId,
    objects,
    selectedIds,
    mode,
    goal,
    exclusions,
    contract,
    sequence,
    continuity,
    reelProject,
    reelOpen,
    visibleSearch: null,
    messages,
    model,
  }), [sessionId, objects, selectedIds, mode, goal, exclusions, contract, sequence, continuity, reelProject, reelOpen, messages, model]);
  persistedProjectRef.current = persistedProject;

  useEffect(() => {
    if (!persistenceReady) return;
    if (!persistedProject) {
      setPersistenceStatus('unavailable');
      return;
    }
    setPersistenceStatus('saving');
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      saveActiveDirectorProject(persistedProject);
      void saveActiveDirectorProjectToIndexedDb(
        persistedProject,
        { objects, reelProject },
        controller.signal,
      ).then((result) => {
        if (active) setPersistenceStatus(result);
      });
    }, 220);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [persistedProject, persistenceReady, objects, reelProject]);

  useEffect(() => {
    const latest = messages.at(-1);
    if (busy || pendingProposal || !latest || latest.role !== 'assistant' || latest.id === welcome.id || latest.id === lastArchivedMessageIdRef.current) return;
    const timeout = window.setTimeout(() => {
      if (!persistedProjectRef.current) return;
      setHistory(archiveDirectorProject(persistedProjectRef.current));
      lastArchivedMessageIdRef.current = latest.id;
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [messages, busy, pendingProposal]);

  const addUploadFiles = useCallback((files: File[]) => {
    const images = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)).slice(0, 16);
    if (!images.length) return;
    const addedIds: string[] = [];
    setObjects((current) => {
      const next = [...current];
      for (const file of images) {
        const id = newId('upload');
        addedIds.push(id);
        next.push({
          id,
          title: file.name.replace(/\.[^.]+$/, '') || 'Local image',
          subtitle: 'Local image · browser only',
          kind: 'upload',
          source: 'UPLOAD',
          imageUrl: URL.createObjectURL(file),
          sourceFile: file,
          position: nextReferencePosition(next),
          inherit: [],
          locks: [],
          summary: EMPTY_SUMMARY,
        });
      }
      return next;
    });
    setSelectedIds(addedIds);
    setMode('inherit');
  }, []);

  const toggleChannel = useCallback((objectId: string, channel: InheritanceChannel) => {
    setObjects((current) => current.map((object) => {
      if (object.id !== objectId) return object;
      const active = object.inherit.includes(channel);
      return {
        ...object,
        inherit: active
          ? object.inherit.filter((item) => item !== channel)
          : [...object.inherit, channel],
      };
    }));
  }, []);

  const changePosition = useCallback((objectId: string, position: { x: number; y: number }) => {
    setObjects((current) => current.map((object) => object.id === objectId ? { ...object, position } : object));
  }, []);

  const changeSelection = useCallback((ids: string[]) => {
    setSelectedIds((current) => (
      current.length === ids.length && current.every((id, index) => id === ids[index])
        ? current
        : ids
    ));
  }, []);

  const removeObject = useCallback((objectId: string) => {
    setObjects((current) => {
      revokeLocalCanvasMedia(
        current.filter((object) => object.id === objectId),
        reelMediaUrls(reelProjectRef.current),
      );
      return current.filter((object) => object.id !== objectId);
    });
    setSelectedIds((current) => current.filter((id) => id !== objectId));
  }, []);

  const applyResponse = useCallback((response: DirectorResponse, actionResults: DirectorCanvasActionResult[]) => {
    const live = liveProjectRef.current;
    const project = applyDirectorCanvasActions({
      objects: live.objects,
      selectedIds: live.selectedIds,
      goal: live.goal,
      exclusions: live.exclusions,
    }, response, actionResults, newId);
    let nextObjects = project.objects;

    if (response.directionContract) {
      setContract(response.directionContract);
      if (!response.sequence) {
        setSequence(null);
        setContinuity(null);
        nextObjects = nextObjects.filter((object) => object.kind !== 'beat');
      }
      const contractObject: CanvasObject = {
        id: 'direction-contract',
        title: response.directionContract.title,
        subtitle: response.directionContract.objective,
        kind: 'contract',
        source: 'CONTRACT',
        position: nextObjects.find((object) => object.id === 'direction-contract')?.position || { x: 1_160, y: 220 },
        inherit: [],
        locks: response.directionContract.locks,
        summary: EMPTY_SUMMARY,
      };
      nextObjects = [...nextObjects.filter((object) => object.id !== contractObject.id), contractObject];
    }

    if (response.sequence) {
      setSequence(response.sequence);
      setContinuity(response.continuity);
      const withoutOldBeats = nextObjects.filter((object) => object.kind !== 'beat');
      const beats: CanvasObject[] = response.sequence.beats.map((beat, index) => ({
        id: beat.id,
        title: beat.title,
        subtitle: beat.visualAction,
        kind: 'beat',
        source: 'STORY',
        position: nextObjects.find((object) => object.id === beat.id)?.position || { x: 1_560 + index * 255, y: 560 + (index % 2) * 48 },
        inherit: [],
        locks: beat.continuityLocks,
        summary: { ...EMPTY_SUMMARY, emotion: [beat.emotion], camera: [beat.camera] },
      }));
      nextObjects = [...withoutOldBeats, ...beats];
      setMode('animate');
    } else {
      if (response.continuity) setContinuity(response.continuity);
      setMode(response.mode);
    }
    setObjects(nextObjects);
    setSelectedIds(project.selectedIds);
    setGoal(project.goal);
    setExclusions(project.exclusions);
    const reelResult = applyDirectorReelActions({
      project: live.reelProject,
      actions: response.reelActions || [],
      objects: nextObjects,
      selectedObjectIds: project.selectedIds,
      sequence: response.sequence || live.sequence,
      createId: newId,
    });
    if (reelResult.project) updateReelProject(reelResult.project);
    if (reelResult.shouldOpen) setReelOpen(true);
    return {
      ...response,
      message: reconcileReelActionMessage(
        response.message,
        response.reelActions.length,
        reelResult.appliedActions,
        Boolean(live.reelProject || reelResult.project),
        reelResult.visualEffectSubstitutionNotices,
      ),
      reelActions: reelResult.appliedActions.map(({ promotedPixelSortClipIds: _promotion, ...action }) => action),
    };
  }, [updateReelProject]);

  const updateAiSettings = useCallback((next: AiSettings) => {
    setAiSettings(next);
    saveAiSettings(next);
  }, []);

  const send = useCallback(async (text: string, label?: string, requestedMode?: CanvasMode) => {
    if (busy || pendingProposal || !isProviderConfigured(aiSettings)) return;
    const requestId = ++requestIdRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const userTurn: ChatTurn = { id: newId('user'), role: 'user', text, label };
    const history = [...messages, userTurn];
    const assistantId = newId('assistant');
    pendingAssistantIdRef.current = assistantId;
    setMessages([...history, {
      id: assistantId,
      role: 'assistant',
      text: '',
    }]);
    setBusy(true);

    try {
      const turnMode = requestedMode
        || (label === 'Compile direction' ? 'combine'
          : label === 'Build visual story' ? 'create'
            : label === 'Check drift' ? 'animate'
              : mode);
      pendingModeRef.current = turnMode;
      const context = serializeDirectorContext({
        mode: turnMode,
        goal,
        exclusions,
        objects,
        selectedIds,
        contract,
        sequence,
        continuity,
        reelProject,
        reelOpen,
        messages: history,
      });
      const providerSettings = aiSettings.providers[aiSettings.selectedProvider];
      const provider = getChatProvider(aiSettings.selectedProvider);
      let raw = '';
      for await (const delta of provider.stream({
        apiKey: providerSettings.apiKey,
        baseUrl: 'baseUrl' in providerSettings ? providerSettings.baseUrl : undefined,
        model: providerSettings.model,
        systemPrompt: `${DIRECTOR_SYSTEM_PROMPT}\n\nCURRENT PROJECT STATE\n${context}`,
        messages: history.slice(-8).map((turn) => ({
          role: turn.role,
          content: turn.text,
        })),
        signal: controller.signal,
      })) {
        if (requestId !== requestIdRef.current) return;
        raw += delta;
        const visible = streamingExplanation(raw);
        setMessages((current) => current.map((turn) => (
          turn.id === assistantId ? { ...turn, text: visible || 'Thinking…' } : turn
        )));
      }
      if (requestId !== requestIdRef.current) return;
      const proposal = parseDirectorAiResponse(raw);
      setMessages((current) => current.map((turn) => (
        turn.id === assistantId ? { ...turn, text: proposal.explanation } : turn
      )));
      setPendingProposal(proposal);
    } catch (error) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setMessages((current) => current.map((turn) => (
        turn.id === assistantId
          ? {
            ...turn,
            text: error instanceof Error ? error.message : 'The Director request failed.',
            error: true,
          }
          : turn
      )));
      pendingAssistantIdRef.current = null;
    } finally {
      if (requestId === requestIdRef.current) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  }, [
    busy,
    pendingProposal,
    aiSettings,
    messages,
    mode,
    goal,
    exclusions,
    objects,
    selectedIds,
    contract,
    sequence,
    continuity,
    reelProject,
    reelOpen,
  ]);

  const applyPendingProposal = useCallback(() => {
    if (!pendingProposal) return;
    const { canvasActions, reelActions } = splitDirectorActions(pendingProposal.actions);
    const response: DirectorResponse = {
      message: pendingProposal.explanation,
      mode: pendingModeRef.current,
      directionContract: null,
      sequence: null,
      continuity: null,
      canvasActions,
      reelActions,
      suggestedActions: [],
    };
    const appliedResponse = applyResponse(response, []);
    const assistantId = pendingAssistantIdRef.current;
    setMessages((current) => current.map((turn) => (
      turn.id === assistantId
        ? { ...turn, text: appliedResponse.message, response: appliedResponse }
        : turn
    )));
    pendingAssistantIdRef.current = null;
    setPendingProposal(null);
  }, [applyResponse, pendingProposal]);

  const discardPendingProposal = useCallback(() => {
    pendingAssistantIdRef.current = null;
    setPendingProposal(null);
  }, []);

  const notify = useCallback((text: string) => {
    setMessages((current) => [...current, { id: newId('assistant'), role: 'assistant', text }]);
  }, []);

  const handleDockAction = useCallback((nextMode: CanvasMode) => {
    if (nextMode === 'inspect' || nextMode === 'inherit') {
      setMode(nextMode);
      return;
    }
    if (nextMode === 'combine') {
      if (referenceCount < 2) {
        setMode('inspect');
        notify('Place at least two visual references on the canvas, then Combine can compile their inheritance into one Direction Contract.');
        return;
      }
      setMode('combine');
      void send('Compile the selected visual ingredients into one Direction Contract. Resolve conflicts and preserve my locks and exclusions.', 'Compile direction', 'combine');
      return;
    }
    if (nextMode === 'create') {
      if (!contract) {
        notify('Compile a Direction Contract first. Create uses that approved contract—not loose references—to build the story.');
        return;
      }
      setMode('create');
      void send('Turn the approved Direction Contract into a six-beat visual story with emotional progression, camera decisions, motion, and continuity locks.', 'Build visual story', 'create');
      return;
    }
    if (nextMode === 'animate') {
      setMode('animate');
      useCanvasSelectionInReel();
      return;
    }
    if (!objects.length) {
      notify('There is nothing to export yet. Add references and build a direction first.');
      return;
    }
    setMode('export');
    updateReelProject((current) => ({
      ...(current || createReelProject(objects, selectedIds, newId, sequence)),
      renderRequested: true,
    }));
    setReelOpen(true);
    notify('The edit is ready in Reel Studio. Review the timeline, then confirm the local MP4 render on this device. No media is uploaded.');
  }, [referenceCount, contract, sequence, objects, selectedIds, notify, send, updateReelProject, useCanvasSelectionInReel]);

  function replaceDirectorProject(
    project: DirectorPersistedProject,
    options: {
      retainedUrls?: ReadonlySet<string>;
      source?: 'browser' | 'file';
    } = {},
  ) {
    requestIdRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setPendingProposal(null);
    pendingAssistantIdRef.current = null;
    revokeAllDirectorMedia(
      liveProjectRef.current.objects,
      reelProjectRef.current,
      options.retainedUrls,
    );
    setObjects(project.objects);
    setSelectedIds(project.selectedIds);
    setMode(project.mode);
    setGoal(project.goal);
    setExclusions(project.exclusions);
    setContract(project.contract);
    setSequence(project.sequence);
    setContinuity(project.continuity);
    setReelProject(project.reelProject);
    reelProjectRef.current = project.reelProject;
    setReelOpen(Boolean(project.reelOpen && project.reelProject));
    const nextMessages = restoredMessages(project, options.source);
    setMessages(nextMessages);
    setModel(project.model);
    setSessionId(project.sessionId);
    setHistoryOpen(false);
    setPersistenceReady(true);
    setPersistenceStatus('saving');
    lastArchivedMessageIdRef.current = nextMessages.at(-1)?.id || welcome.id;
    persistedProjectRef.current = makePersistableDirectorProject({
      sessionId: project.sessionId,
      objects: project.objects,
      selectedIds: project.selectedIds,
      mode: project.mode,
      goal: project.goal,
      exclusions: project.exclusions,
      contract: project.contract,
      sequence: project.sequence,
      continuity: project.continuity,
      reelProject: project.reelProject,
      reelOpen: project.reelOpen,
      visibleSearch: null,
      messages: nextMessages,
      model: project.model,
    });
  }

  function exportProjectJson() {
    const project = persistedProjectRef.current;
    if (!project) {
      setProjectFileNotice('This project could not be exported because its current state is invalid.');
      return;
    }
    let url: string | null = null;
    let anchor: HTMLAnchorElement | null = null;
    try {
      const contents = stringifyDirectorProjectFile(project as DirectorProjectFile);
      url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = projectFileName(project.title);
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      setProjectFileNotice('Project JSON exported. Private media bytes and AI provider keys were not included.');
    } catch (error) {
      setProjectFileNotice(
        error instanceof Error
          ? `The project JSON could not be exported: ${error.message}`
          : 'The project JSON could not be exported.',
      );
    } finally {
      anchor?.remove();
      if (url) {
        const downloadUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      }
    }
  }

  async function importProjectJson(file: File) {
    let imported: DirectorProjectFile;
    try {
      if (file.size > MAX_DIRECTOR_PROJECT_JSON_BYTES) {
        throw new Error(
          `Project files are limited to ${MAX_DIRECTOR_PROJECT_JSON_BYTES / 1_048_576} MB.`,
        );
      }
      imported = parseDirectorProjectJson(await readProjectFile(file));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The JSON is not a valid Director project.';
      setProjectFileNotice(`Could not import ${file.name}: ${reason} The current project was not changed.`);
      return;
    }

    const current = persistedProjectRef.current;
    const reconciled = reconcileImportedBrowserMedia(
      imported,
      sessionId,
      liveProjectRef.current.objects,
      reelProjectRef.current,
    );
    if (current) setHistory(archiveDirectorProject(current));
    projectFileImportedRef.current = true;
    replaceDirectorProject(reconciled.project, {
      retainedUrls: reconciled.retainedUrls,
      source: 'file',
    });
    setProjectFileNotice(
      reconciled.project.localMediaOmitted
        ? `Imported ${file.name}. ${reconciled.project.localMediaOmitted} local media ${reconciled.project.localMediaOmitted === 1 ? 'item needs' : 'items need'} to be added again.`
        : reconciled.retainedUrls.size
          ? `Imported ${file.name}. Existing browser-local media was reconnected by stable ids.`
          : `Imported ${file.name}. The project did not require browser-local media reconnection.`,
    );
  }

  function newProject() {
    if (persistedProjectRef.current) setHistory(archiveDirectorProject(persistedProjectRef.current));
    clearActiveDirectorProject();
    void clearActiveDirectorProjectFromIndexedDb();
    requestIdRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setPendingProposal(null);
    pendingAssistantIdRef.current = null;
    revokeAllDirectorMedia(objects, reelProjectRef.current);
    reelProjectRef.current = null;
    setObjects([]);
    setSelectedIds([]);
    setMode('inspect');
    setContract(null);
    setSequence(null);
    setContinuity(null);
    setReelProject(null);
    setReelOpen(false);
    setMessages([welcome]);
    setModel(DEFAULT_DIRECTOR_MODEL);
    setSessionId(crypto.randomUUID?.() || `director-${Date.now()}`);
    setHistoryOpen(false);
    setProjectFileNotice('');
    lastArchivedMessageIdRef.current = welcome.id;
  }

  function restoreHistory(id: string) {
    const project = loadDirectorHistoryProject(id);
    if (!project) return;
    setProjectFileNotice('');
    replaceDirectorProject(project);
  }

  function deleteHistory(id: string) {
    setHistory(deleteDirectorHistoryProject(id));
  }

  return (
    <div className="director-page" id="main-content">
      <main className={`director-stage ${reelOpen ? 'reel-active' : ''}`}>
        {reelOpen && reelProject ? (
          <DirectorReelStudio
            project={reelProject}
            onChange={updateReelProject}
            canvasSelectionCount={selectedIds.length || referenceCount}
            onUseCanvasSelection={useCanvasSelectionInReel}
            onClose={() => { setReelOpen(false); setMode('animate'); }}
          />
        ) : (
          <DirectorCanvas
            objects={objects}
            selectedIds={selectedIds}
            mode={mode}
            goal={goal}
            exclusions={exclusions}
            contract={contract}
            sequence={sequence}
            continuity={continuity}
            onGoalChange={setGoal}
            onExclusionsChange={setExclusions}
            onModeChange={handleDockAction}
            onSelectionChange={changeSelection}
            onPositionChange={changePosition}
            onToggleChannel={toggleChannel}
            onUploadFiles={addUploadFiles}
            onRemoveObject={removeObject}
          />
        )}
        <DirectorChat
          messages={messages}
          busy={busy}
          selectedCount={selectedCount}
          objectCount={objects.length}
          referenceCount={referenceCount}
          hasContract={Boolean(contract)}
          hasSequence={Boolean(sequence)}
          hasReel={Boolean(reelProject?.clips.length)}
          reelOpen={reelOpen}
          aiSettings={aiSettings}
          pendingProposal={pendingProposal}
          history={history}
          historyOpen={historyOpen}
          persistenceStatus={persistenceStatus}
          projectFileNotice={projectFileNotice}
          onAiSettingsChange={updateAiSettings}
          onApplyProposal={applyPendingProposal}
          onDiscardProposal={discardPendingProposal}
          onSend={send}
          onNewProject={newProject}
          onExportProject={exportProjectJson}
          onImportProject={(file) => { void importProjectJson(file); }}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          onRestoreHistory={restoreHistory}
          onDeleteHistory={deleteHistory}
        />
      </main>
    </div>
  );
}
