import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DIRECTOR_MODEL,
  type ContinuityReport,
  type DirectionContract,
  type DirectorContext,
  type DirectorModel,
  type DirectorResponse,
  type InheritanceChannel,
  type StorySequence,
} from '../../shared/directorSchemas';
import { api } from '../../lib/api';
import { DirectorCanvas } from './components/DirectorCanvas';
import { DirectorChat } from './components/DirectorChat';
import {
  applyDirectorCanvasActions,
  type DirectorCanvasActionResult,
  type DirectorTurnResult,
} from './directorActions';
import { nextReferencePosition } from './directorLayout';
import { DirectorReelStudio } from './reel/DirectorReelStudio';
import {
  applyDirectorReelActions,
  createReelProject,
  ensureExecutableReelIntent,
  normalizeReelProject,
  reconcileReelActionMessage,
  toReelProjectContext,
} from './reel/project';
import { revokeProjectObjectUrls, revokeRemovedProjectObjectUrls } from './reel/media';
import type { ReelProject } from './reel/types';
import {
  archiveDirectorProject,
  clearActiveDirectorProject,
  deleteDirectorHistoryProject,
  listDirectorHistory,
  loadActiveDirectorProject,
  loadDirectorHistoryProject,
  makePersistableDirectorProject,
  saveActiveDirectorProject,
  type DirectorPersistedProject,
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

function revokeLocalCanvasMedia(objects: CanvasObject[]) {
  for (const object of objects) {
    if (object.source === 'UPLOAD' && object.imageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(object.imageUrl);
    }
  }
}

function restoredMessages(project: DirectorPersistedProject | null) {
  const messages = project?.messages.length ? project.messages : [welcome];
  if (!project?.localMediaOmitted) return messages;
  return [...messages, {
    id: `local-media-restore-${project.sessionId}-${project.updatedAt}`,
    role: 'assistant' as const,
    text: `Project history was restored. ${project.localMediaOmitted} local media ${project.localMediaOmitted === 1 ? 'item was' : 'items were'} not retained because browser file permissions expire after refresh; add those local files again before rendering.`,
  }];
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
  const [sessionId, setSessionId] = useState(() => initialProject?.sessionId || crypto.randomUUID?.() || `director-${Date.now()}`);
  const [history, setHistory] = useState(() => listDirectorHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<'saving' | 'saved' | 'unavailable'>('saving');
  const [providerStatus, setProviderStatus] = useState<{
    mode: 'checking' | 'gemini' | 'openai' | 'demo' | 'unconfigured';
    geminiConfigured: boolean;
    openaiConfigured: boolean;
    demoEnabled: boolean;
  }>({ mode: 'checking', geminiConfigured: false, openaiConfigured: false, demoEnabled: false });
  const reelProjectRef = useRef<ReelProject | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const persistedProjectRef = useRef<DirectorPersistedProject | null>(initialProject);
  const lastArchivedMessageIdRef = useRef(initialProject?.messages.at(-1)?.id || welcome.id);
  const liveProjectRef = useRef({ objects, selectedIds, goal, exclusions, reelProject, sequence });
  reelProjectRef.current = reelProject;
  liveProjectRef.current = { objects, selectedIds, goal, exclusions, reelProject, sequence };

  const updateReelProject = useCallback((update: ReelProject | null | ((current: ReelProject | null) => ReelProject | null)) => {
    setReelProject((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      revokeRemovedProjectObjectUrls(current, next);
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

  useEffect(() => () => {
    requestIdRef.current += 1;
    requestRef.current?.abort();
    revokeLocalCanvasMedia(liveProjectRef.current.objects);
    revokeProjectObjectUrls(reelProjectRef.current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void api.get<{
      provider?: 'gemini' | 'openai' | 'demo' | 'unconfigured';
      geminiConfigured?: boolean;
      openaiConfigured?: boolean;
      demoEnabled?: boolean;
    }>('/api/health', controller.signal).then((result) => {
      if (!result.ok) return;
      setProviderStatus({
        mode: result.provider || 'unconfigured',
        geminiConfigured: Boolean(result.geminiConfigured),
        openaiConfigured: Boolean(result.openaiConfigured),
        demoEnabled: Boolean(result.demoEnabled),
      });
    }).catch(() => setProviderStatus({
      mode: 'unconfigured',
      geminiConfigured: false,
      openaiConfigured: false,
      demoEnabled: false,
    }));
    return () => controller.abort();
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
    if (!persistedProject) {
      setPersistenceStatus('unavailable');
      return;
    }
    setPersistenceStatus('saving');
    const timeout = window.setTimeout(() => {
      setPersistenceStatus(saveActiveDirectorProject(persistedProject) ? 'saved' : 'unavailable');
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [persistedProject]);

  useEffect(() => {
    const latest = messages.at(-1);
    if (!latest || latest.role !== 'assistant' || latest.id === welcome.id || latest.id === lastArchivedMessageIdRef.current) return;
    const timeout = window.setTimeout(() => {
      if (!persistedProjectRef.current) return;
      setHistory(archiveDirectorProject(persistedProjectRef.current));
      lastArchivedMessageIdRef.current = latest.id;
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [messages]);

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
      revokeLocalCanvasMedia(current.filter((object) => object.id === objectId));
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

  const send = useCallback(async (text: string, label?: string, requestedMode?: CanvasMode) => {
    if (busy) return;
    const requestId = ++requestIdRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const userTurn: ChatTurn = { id: newId('user'), role: 'user', text, label };
    const history = [...messages, userTurn];
    setMessages(history);
    setBusy(true);

    try {
      const selected = new Set(selectedIds);
      const turnMode = requestedMode
        || (label === 'Compile direction' ? 'combine'
          : label === 'Build visual story' ? 'create'
            : label === 'Check drift' ? 'animate'
              : mode);
      const context: DirectorContext = {
        mode: turnMode,
        goal,
        exclusions,
        canvas: objects.map((object) => ({
          id: object.id,
          assetId: object.assetId || null,
          title: object.title,
          source: object.source,
          kind: object.kind,
          selected: selected.has(object.id),
          inherit: object.inherit,
          locks: object.locks,
          decodedSummary: object.summary,
        })),
        visibleSearch: null,
        recentConversation: history.slice(-10).map((turn) => ({
          role: turn.role,
          text: turn.text,
          label: turn.label || null,
        })),
        directionContract: contract,
        sequence,
        reelProject: toReelProjectContext(reelProject, reelOpen),
      };

      const result = await api.post<DirectorTurnResult>('/api/director', { message: text, model, sessionId, context }, controller.signal);
      if (requestId !== requestIdRef.current) return;
      if (!result.ok) throw new Error(result.error || 'The Visual Expert could not complete this turn.');
      const executableResponse = ensureExecutableReelIntent(text, result.response, {
        hasCanvasMedia: liveProjectRef.current.objects.some((object) => (
          Boolean(object.imageUrl) && ['reference', 'upload', 'created'].includes(object.kind)
        )),
        hasReel: Boolean(liveProjectRef.current.reelProject?.clips.length),
      });
      const appliedResponse = applyResponse(executableResponse, result.canvasActionResults || []);
      setMessages((current) => [...current, {
        id: newId('assistant'),
        role: 'assistant',
        text: appliedResponse.message,
        response: appliedResponse,
      }]);
    } catch (error) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setMessages((current) => [...current, {
        id: newId('error'),
        role: 'assistant',
        text: error instanceof Error ? error.message : 'The Director request failed.',
        error: true,
      }]);
    } finally {
      if (requestId === requestIdRef.current) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  }, [busy, messages, selectedIds, mode, goal, exclusions, objects, contract, sequence, reelProject, reelOpen, model, sessionId, applyResponse]);

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

  function newProject() {
    if (persistedProjectRef.current) setHistory(archiveDirectorProject(persistedProjectRef.current));
    clearActiveDirectorProject();
    requestIdRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    revokeLocalCanvasMedia(objects);
    setObjects([]);
    setSelectedIds([]);
    setMode('inspect');
    setContract(null);
    setSequence(null);
    setContinuity(null);
    updateReelProject(null);
    setReelOpen(false);
    setMessages([welcome]);
    setModel(DEFAULT_DIRECTOR_MODEL);
    setSessionId(crypto.randomUUID?.() || `director-${Date.now()}`);
    setHistoryOpen(false);
    lastArchivedMessageIdRef.current = welcome.id;
  }

  function restoreHistory(id: string) {
    const project = loadDirectorHistoryProject(id);
    if (!project) return;
    requestIdRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    revokeLocalCanvasMedia(objects);
    setObjects(project.objects);
    setSelectedIds(project.selectedIds);
    setMode(project.mode);
    setGoal(project.goal);
    setExclusions(project.exclusions);
    setContract(project.contract);
    setSequence(project.sequence);
    setContinuity(project.continuity);
    updateReelProject(project.reelProject);
    setReelOpen(Boolean(project.reelOpen && project.reelProject));
    const nextMessages = restoredMessages(project);
    setMessages(nextMessages);
    setModel(project.model);
    setSessionId(project.sessionId);
    setHistoryOpen(false);
    lastArchivedMessageIdRef.current = nextMessages.at(-1)?.id || welcome.id;
    saveActiveDirectorProject(project);
    setPersistenceStatus('saved');
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
          model={model}
          history={history}
          historyOpen={historyOpen}
          persistenceStatus={persistenceStatus}
          providerStatus={providerStatus}
          onModelChange={setModel}
          onSend={send}
          onNewProject={newProject}
          onToggleHistory={() => setHistoryOpen((open) => !open)}
          onRestoreHistory={restoreHistory}
          onDeleteHistory={deleteHistory}
        />
      </main>
    </div>
  );
}
