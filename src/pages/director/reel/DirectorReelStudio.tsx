import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  Info,
  LoaderCircle,
  Music,
  Redo2,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  pluginRegistry,
  resolvedPluginParams,
  safePluginParams,
} from '../../../plugins/registry';
import type { VerifyReport } from '../../../lib/verify';
import {
  REEL_FORMATS,
  REEL_GRADES,
  REEL_QUALITIES,
  REEL_VISUAL_EFFECTS,
  reelDimensions,
} from './catalog';
import { BrowserFfmpegRenderer, hasHeavyVisualEffects } from './ffmpegRenderer';
import {
  assertKnownMediaLimits,
  reelProjectFingerprint,
  validateLocalAudio,
  validateLocalImage,
} from './media';
import { compileReelTimeline, normalizeReelProject, reelDuration } from './project';
import {
  canRedo,
  canUndo,
  clipEditLabel,
  createHistory,
  pushHistory,
  redoHistory,
  rehydrateProjectMedia,
  undoHistory,
} from './projectHistory';
import { estimateRender } from './renderEstimate';
import { loadSampleFiles, toFileList } from './sampleMedia';
import { StillExportPanel } from './StillExportPanel';
import { ExportVerifyPanel } from './ExportVerifyPanel';
import { ReelPreview } from './ReelPreview';
import { PluginParamFields } from './PluginParamFields';
import { ReelSelect } from './ReelSelect';
import { PluginPicker } from './PluginPicker';
import { ReelStackControl } from './ReelStackControl';
import {
  INITIAL_RENDER_STATE,
  reelGradeStack,
  reelVisualEffectStack,
  type ReelClip,
  type ReelProject,
  type ReelRenderState,
} from './types';
import type { InspectorSectionId, PlayerFit } from '../workspaceLayout';
import type { TextLayer } from '../../../shared/directorSchemas';
import { createTextLayer, MAX_TEXT_LAYERS_PER_CLIP } from '../../../shared/textLayers';
import { TextLayerInspector } from './TextLayerInspector';
import {
  effectiveRenderBackend,
  renderBackendLabel,
} from '../../../shared/directorRenderBackend';
import {
  adobeHandoffArchiveName,
  DirectorLocalAdobeUnavailableError,
  sendDirectorAdobeHandoffToLocalService,
  zipDirectorAdobeHandoff,
} from './adobeHandoff';
import { prepareDirectorAdobeHandoff } from './adobeEffectPlates';
import {
  DirectorLocalOutputUnavailableError,
  revealDirectorLocalOutput,
  saveDirectorLocalOutput,
} from './localOutput';
import './DirectorReelStudio.css';

type Props = {
  project: ReelProject;
  onChange: (project: ReelProject) => void;
  onClose: () => void;
  canvasSelectionCount?: number;
  onUseCanvasSelection?: () => void;
  playerFit?: PlayerFit;
  onPlayerFitChange?: (fit: PlayerFit) => void;
  inspectorSections?: Record<InspectorSectionId, boolean>;
  onToggleInspectorSection?: (id: InspectorSectionId) => void;
};

const DEFAULT_INSPECTOR_SECTIONS: Record<InspectorSectionId, boolean> = {
  output: true, look: true, motion: true, text: true, timing: true,
};

function InspectorSection({ id, title, meta, open, onToggle, children }: {
  id: InspectorSectionId;
  title: string;
  meta?: string;
  open: boolean;
  onToggle?: (id: InspectorSectionId) => void;
  children: ReactNode;
}) {
  return (
    <section className={`inspector-section ${open ? 'open' : 'closed'}`}>
      <button
        type="button"
        className="inspector-section-head"
        aria-expanded={open}
        onClick={() => onToggle?.(id)}
      >
        <span>{title}</span>
        {meta && <em>{meta}</em>}
        <ChevronDown size={14} className={`inspector-section-caret ${open ? 'open' : ''}`} />
      </button>
      {open && <div className="inspector-section-body">{children}</div>}
    </section>
  );
}

function fileId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() || Date.now().toString(36)}`;
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return '';
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 75) return 'about 1 min left';
  return `about ${Math.max(2, Math.ceil(seconds / 60))} min left`;
}

function indexOfClip(clips: ReelClip[], id: string) {
  return Math.max(0, clips.findIndex((clip) => clip.id === id));
}

export function DirectorReelStudio({
  project,
  onChange,
  onClose,
  canvasSelectionCount = 0,
  onUseCanvasSelection,
  playerFit = 'fit',
  onPlayerFitChange,
  inspectorSections = DEFAULT_INSPECTOR_SECTIONS,
  onToggleInspectorSection,
}: Props) {
  const activeRenderRef = useRef<{
    id: number;
    renderer: BrowserFfmpegRenderer;
    cancelled: boolean;
  } | null>(null);
  const renderIdRef = useRef(0);
  const outputUrlRef = useRef<string | null>(null);
  const renderedFingerprintRef = useRef<string | null>(null);
  const latestFingerprintRef = useRef('');
  const lastRenderLogRef = useRef('');
  const renderStartedAtRef = useRef<number | null>(null);
  const [renderState, setRenderState] = useState<ReelRenderState>(INITIAL_RENDER_STATE);
  const [verifyReport, setVerifyReport] = useState<VerifyReport | null>(null);
  const [mediaNotice, setMediaNotice] = useState('');
  const [showQualityWarning, setShowQualityWarning] = useState(false);
  const [showRenderDetails, setShowRenderDetails] = useState(false);
  const [selectedTextLayerId, setSelectedTextLayerId] = useState<string | null>(null);
  const [showStillExport, setShowStillExport] = useState(false);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [outputNotice, setOutputNotice] = useState('');
  const [latestOutputPath, setLatestOutputPath] = useState<string | null>(null);
  const [history, setHistory] = useState(() => createHistory(project, Date.now()));
  const pendingLabelRef = useRef<string | null>(null);
  // Set while applying an undo/redo, so the resulting prop change is not
  // recorded as a fresh edit.
  const travellingRef = useRef(false);
  /** One reusable object URL per File, so travelling cannot accumulate handles. */
  const travelUrlsRef = useRef(new Map<File, string>());
  // The playhead moves every animation frame. Keeping it in a ref means
  // playback never re-renders the studio; the still exporter reads it only at
  // the moment it needs it.
  const playheadRef = useRef(0);
  const selectedClipIds = project.selectedClipIds.filter((id) => project.clips.some((clip) => clip.id === id));
  const selectedId = selectedClipIds[0];
  const selectedClip = project.clips.find((clip) => clip.id === selectedId) || null;
  const dimensions = reelDimensions(project.aspectRatio, project.quality);
  const duration = reelDuration(project);
  // A still captures what is on screen, so the playhead — not the timeline
  // selection — decides which clip and which moment gets exported. Resolved on
  // demand so a moving playhead costs nothing.
  const resolveStillTarget = useCallback(() => {
    if (!project.clips.length) return null;
    const time = playheadRef.current;
    const timeline = compileReelTimeline(project);
    const index = timeline.clips.findIndex(
      (entry, position) => time >= entry.start
        && (time < entry.start + project.clips[position].duration
          || position === project.clips.length - 1),
    );
    const resolved = index >= 0 ? index : 0;
    const clip = project.clips[resolved];
    const local = Math.max(0, time - timeline.clips[resolved].start);
    return {
      clip,
      progress: clip.duration > 0 ? Math.min(1, local / clip.duration) : 0,
    };
  }, [project]);
  const rendering = ['loading', 'preparing', 'rendering', 'cancelling'].includes(renderState.stage);
  const renderEstimate = useMemo(() => estimateRender(project, {
    durationSeconds: duration,
    hasStructuralPass: hasHeavyVisualEffects(project),
  }), [project, duration]);
  const heavyEffectsNeedQuality = hasHeavyVisualEffects(project)
    && (project.quality === 'draft' || project.quality === 'balanced');
  const fingerprint = reelProjectFingerprint(project);
  latestFingerprintRef.current = fingerprint;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const capability = useMemo(() => ({
    cores: navigator.hardwareConcurrency || null,
    memory: deviceMemory || null,
  }), [deviceMemory]);
  const constrainedHighQuality = (project.quality === 'high' || project.quality === 'maximum')
    && ((capability.memory !== null && capability.memory <= 4) || (capability.cores !== null && capability.cores <= 4));
  const hasEditableTransitionTarget = selectedClipIds.some((id) => project.clips[0]?.id !== id);
  const transitionClip = selectedClipIds
    .map((id) => project.clips.find((clip) => clip.id === id) || null)
    .find((clip) => clip && project.clips[0]?.id !== clip.id) || selectedClip;
  const selectedEffectPlugins = selectedClip
    ? [...reelVisualEffectStack(selectedClip), ...reelGradeStack(selectedClip)]
      .filter((id, index, values) => values.indexOf(id) === index)
      .flatMap((id) => {
        const plugin = pluginRegistry.get(id);
        return plugin?.kind === 'effect' ? [plugin] : [];
      })
    : [];
  const sharedIntensityPluginId = selectedEffectPlugins.find((plugin) => (
    Object.hasOwn(plugin.params.schema.shape, 'intensity')
  ))?.id;
  const selectedMotionPlugin = selectedClip
    ? pluginRegistry.getMotion(selectedClip.motion)
    : undefined;
  const selectedTransitionPlugin = transitionClip
    ? pluginRegistry.getTransition(transitionClip.transition)
    : undefined;

  useEffect(() => () => {
    activeRenderRef.current?.renderer.cancel();
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
  }, []);

  useEffect(() => {
    if (!renderedFingerprintRef.current || renderedFingerprintRef.current === fingerprint) return;
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    renderedFingerprintRef.current = null;
    setOutputNotice('');
    setLatestOutputPath(null);
    setVerifyReport(null);
    setRenderState(INITIAL_RENDER_STATE);
  }, [fingerprint]);

  useEffect(() => {
    if (!heavyEffectsNeedQuality) setShowQualityWarning(false);
  }, [heavyEffectsNeedQuality]);

  useEffect(() => {
    if (selectedTextLayerId && !selectedClip?.textLayers.some((layer) => layer.id === selectedTextLayerId)) {
      setSelectedTextLayerId(null);
    }
  }, [selectedClip, selectedTextLayerId]);

  function commitProject(next: ReelProject, label?: string) {
    // The history effect reads this to decide whether this edit continues the
    // previous gesture or starts a new undo step.
    pendingLabelRef.current = label ?? null;
    onChange(normalizeReelProject({ ...next, renderRequested: false }));
  }

  function updateClip(id: string, patch: Partial<ReelClip>) {
    const targets = selectedClipIds.includes(id) ? new Set(selectedClipIds) : new Set([id]);
    commitProject({
      ...project,
      clips: project.clips.map((clip, index) => (
        targets.has(clip.id) && !(index === 0 && ('transition' in patch || 'transitionDuration' in patch))
          ? { ...clip, ...patch }
          : clip
      )),
    // Dragging one slider is one undo step, not one per animation frame.
    }, clipEditLabel([...targets], Object.keys(patch)));
  }

  function updatePluginParam(
    id: string,
    pluginId: string,
    field: string,
    value: unknown,
    legacyField?: 'intensity' | 'transitionDuration',
  ) {
    const targets = selectedClipIds.includes(id) ? new Set(selectedClipIds) : new Set([id]);
    commitProject({
      ...project,
      clips: project.clips.map((clip, index) => {
        if (!targets.has(clip.id)) return clip;
        if (legacyField === 'transitionDuration' && index === 0) return clip;
        if (legacyField) return { ...clip, [legacyField]: value };
        return {
          ...clip,
          pluginParams: {
            ...clip.pluginParams,
            [pluginId]: {
              ...clip.pluginParams?.[pluginId],
              [field]: value,
            },
          },
        };
      }),
    });
  }

  function commitClipTextLayers(clipId: string, layers: TextLayer[]) {
    commitProject({
      ...project,
      clips: project.clips.map((clip) => (clip.id === clipId ? { ...clip, textLayers: layers } : clip)),
    });
  }

  function addTextLayer() {
    if (!selectedClip || selectedClip.textLayers.length >= MAX_TEXT_LAYERS_PER_CLIP) return;
    const layer = createTextLayer(fileId('text'), { content: 'New text', clipDuration: selectedClip.duration });
    commitClipTextLayers(selectedClip.id, [...selectedClip.textLayers, layer]);
    setSelectedTextLayerId(layer.id);
  }

  function updateTextLayer(next: TextLayer) {
    if (!selectedClip) return;
    commitClipTextLayers(selectedClip.id, selectedClip.textLayers.map((layer) => (layer.id === next.id ? next : layer)));
  }

  function removeTextLayer(id: string) {
    if (!selectedClip) return;
    commitClipTextLayers(selectedClip.id, selectedClip.textLayers.filter((layer) => layer.id !== id));
    setSelectedTextLayerId((current) => (current === id ? null : current));
  }

  function moveTextLayer(id: string, direction: -1 | 1) {
    if (!selectedClip) return;
    const layers = [...selectedClip.textLayers];
    const index = layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return;
    [layers[index], layers[target]] = [layers[target], layers[index]];
    commitClipTextLayers(selectedClip.id, layers);
  }

  function selectClip(id: string, additive = false) {
    if (!additive) {
      onChange({ ...project, selectedClipIds: [id] });
      return;
    }
    const selected = new Set(selectedClipIds);
    if (selected.has(id) && selected.size > 1) selected.delete(id);
    else selected.add(id);
    onChange({ ...project, selectedClipIds: [...selected] });
  }

  function moveClip(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= project.clips.length) return;
    const clips = [...project.clips];
    [clips[index], clips[target]] = [clips[target], clips[index]];
    commitProject({ ...project, clips });
  }

  function removeClip(id: string) {
    const clips = project.clips.filter((item) => item.id !== id);
    const selected = selectedClipIds.filter((selectedClipId) => selectedClipId !== id);
    const fallback = clips[Math.min(indexOfClip(project.clips, id), Math.max(0, clips.length - 1))];
    commitProject({ ...project, clips, selectedClipIds: selected.length ? selected : fallback ? [fallback.id] : [] });
  }

  // Record every project change — manual, sample import, or AI-applied — so
  // anything that alters the reel can be taken back.
  useEffect(() => {
    if (travellingRef.current) {
      travellingRef.current = false;
      return;
    }
    const label = pendingLabelRef.current;
    pendingLabelRef.current = null;
    setHistory((current) => pushHistory(current, project, { label, at: Date.now() }));
  }, [project]);

  function travelTo(next: typeof history) {
    if (next === history) return;
    // Removing a clip revokes its object URL, so a snapshot restored by undo
    // can point at media the browser has already released. Mint live URLs from
    // the Files the snapshot still holds before handing the project back.
    const restored = rehydrateProjectMedia(next.present.project, travelUrlsRef.current);
    travellingRef.current = true;
    // Keep history's tip identical to what the app now holds, or the next edit
    // would look like a change and push a spurious entry.
    setHistory(restored === next.present.project
      ? next
      : { ...next, present: { ...next.present, project: restored } });
    onChange(restored);
  }

  function undoEdit() {
    travelTo(undoHistory(history));
  }

  function redoEdit() {
    travelTo(redoHistory(history));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      // Never steal undo from a field the person is typing in.
      if (target?.isContentEditable
        || target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      if (event.shiftKey) redoEdit();
      else undoEdit();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  async function addSampleImages() {
    if (loadingSamples) return;
    setLoadingSamples(true);
    try {
      addLocalImages(toFileList(await loadSampleFiles()));
    } catch (error) {
      setMediaNotice(error instanceof Error ? error.message : 'Director could not load the samples.');
    } finally {
      setLoadingSamples(false);
    }
  }

  function addLocalImages(files: FileList | null) {
    if (!files) return;
    const available = Math.max(0, 16 - project.clips.length);
    const rejected: string[] = [];
    const accepted = Array.from(files).filter((file) => {
      const error = validateLocalImage(file);
      if (error) rejected.push(`${file.name}: ${error}`);
      return !error;
    });
    if (accepted.length > available) rejected.push(`Only ${available} more clip${available === 1 ? '' : 's'} fit in the 16-clip timeline.`);
    const additions = accepted.slice(0, available).map((file, index): ReelClip => ({
      id: fileId('clip'),
      objectId: null,
      title: file.name.replace(/\.[^.]+$/, ''),
      imageUrl: URL.createObjectURL(file),
      sourceFile: file,
      duration: 3.2,
      durationWasUserSet: false,
      effect: index % 2 ? 'clean' : 'cinematic',
      gradeStack: [index % 2 ? 'clean' : 'cinematic'],
      visualEffect: 'none',
      visualEffectStack: [],
      transition: project.clips.length + index === 0 ? 'cut' : 'crossfade',
      transitionDuration: project.clips.length + index === 0 ? 0 : 0.45,
      motion: index % 2 ? 'pull-out' : 'push-in',
      intensity: 62,
      textLayers: [],
    }));
    setMediaNotice(rejected.slice(0, 2).join(' '));
    if (!additions.length) return;
    const next = { ...project, clips: [...project.clips, ...additions], selectedClipIds: additions.map((clip) => clip.id) };
    try {
      assertKnownMediaLimits(next);
    } catch (error) {
      additions.forEach((clip) => URL.revokeObjectURL(clip.imageUrl));
      setMediaNotice(error instanceof Error ? error.message : 'Those images exceed the local media limit.');
      return;
    }
    commitProject(next);
  }

  function setAudio(file: File | undefined) {
    if (!file) return;
    const error = validateLocalAudio(file);
    if (error) {
      setMediaNotice(`${file.name}: ${error}`);
      return;
    }
    const nextAudio = { name: file.name, sourceFile: file, url: URL.createObjectURL(file) };
    try {
      assertKnownMediaLimits({ ...project, audio: nextAudio });
    } catch (limitError) {
      URL.revokeObjectURL(nextAudio.url);
      setMediaNotice(limitError instanceof Error ? limitError.message : 'That audio file exceeds the local media limit.');
      return;
    }
    setMediaNotice('');
    commitProject({ ...project, audio: nextAudio });
  }

  async function render() {
    if (!project.clips.length || rendering) return;
    if (effectiveRenderBackend(project) === 'after-effects') {
      await prepareAdobeHandoff();
      return;
    }
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    renderedFingerprintRef.current = null;
    setVerifyReport(null);
    setOutputNotice('');
    setLatestOutputPath(null);
    setRenderState({ stage: 'loading', progress: 0, message: 'Starting local render…', outputUrl: null, outputBytes: null });
    const renderer = new BrowserFfmpegRenderer();
    const job = { id: ++renderIdRef.current, renderer, cancelled: false };
    activeRenderRef.current = job;
    const ownsRender = () => activeRenderRef.current?.id === job.id;
    const renderFingerprint = fingerprint;
    lastRenderLogRef.current = '';
    renderStartedAtRef.current = null;
    onChange({ ...project, renderRequested: false });
    let completedVerifyReport: VerifyReport | null = null;
    try {
      const blob = await renderer.render(project, {
        onStage: (stage, message) => {
          if (stage === 'rendering' && renderStartedAtRef.current === null) renderStartedAtRef.current = performance.now();
          if (ownsRender() && !job.cancelled) setRenderState((current) => ({ ...current, stage, message }));
        },
        onProgress: (progress) => {
          if (ownsRender() && !job.cancelled) setRenderState((current) => ({ ...current, progress }));
        },
        onLog: (message) => {
          if (!ownsRender() || job.cancelled) return;
          lastRenderLogRef.current = message;
          const frameMatch = message.match(/frame=\s*(\d+)/i);
          if (frameMatch) {
            const frame = Number(frameMatch[1]);
            const totalFrames = Math.max(1, Math.round(duration * project.fps));
            const progress = Math.min(0.99, frame / totalFrames);
            const startedAt = renderStartedAtRef.current;
            const elapsed = startedAt === null ? 0 : Math.max(0, (performance.now() - startedAt) / 1_000);
            const eta = progress > 0.02 ? formatEta((elapsed / progress) * (1 - progress)) : 'measuring speed…';
            setRenderState((current) => ({
              ...current,
              progress: Math.max(current.progress, progress),
              message: `Rendering frame ${Math.min(frame, totalFrames)}/${totalFrames} · ${Math.round(progress * 100)}% · ${eta}`,
            }));
            return;
          }
          if (/frame=|error|invalid|failed|conversion/i.test(message)) {
            setRenderState((current) => ({ ...current, message: message.slice(-180) }));
          }
        },
        onVerify: (report) => {
          completedVerifyReport = report;
        },
      });
      if (!ownsRender() || job.cancelled) return;
      if (renderFingerprint !== latestFingerprintRef.current) {
        setRenderState({
          stage: 'error',
          progress: 0,
          message: 'The edit changed during rendering, so the older output was discarded. Render the current timeline again.',
          outputUrl: null,
          outputBytes: null,
        });
        return;
      }
      setRenderState({
        stage: 'preparing',
        progress: 0.99,
        message: 'Saving FFmpeg output to Movies/Director…',
        outputUrl: null,
        outputBytes: blob.size,
      });
      let savedOutputPath: string | null = null;
      let saveNotice = '';
      try {
        const saved = await saveDirectorLocalOutput(blob, project.title);
        savedOutputPath = saved.outputPath;
        saveNotice = `Saved via FFmpeg. Output: ${saved.outputPath}`;
      } catch (error) {
        saveNotice = error instanceof DirectorLocalOutputUnavailableError
          ? 'Automatic local saving is unavailable in this build. Use Download MP4 to save the finished file.'
          : `The MP4 rendered successfully, but automatic saving failed: ${
            error instanceof Error ? error.message : String(error)
          } Use Download MP4 to keep the file.`;
      }
      if (!ownsRender() || job.cancelled) return;
      if (renderFingerprint !== latestFingerprintRef.current) {
        setRenderState({
          stage: 'error',
          progress: 0,
          message: savedOutputPath
            ? `The edit changed after rendering. The older output is safe at ${savedOutputPath}.`
            : 'The edit changed during rendering, so the older browser output was discarded.',
          outputUrl: null,
          outputBytes: null,
        });
        if (savedOutputPath) {
          setLatestOutputPath(savedOutputPath);
          setOutputNotice(saveNotice);
        }
        return;
      }
      const outputUrl = URL.createObjectURL(blob);
      outputUrlRef.current = outputUrl;
      renderedFingerprintRef.current = renderFingerprint;
      setLatestOutputPath(savedOutputPath);
      setOutputNotice(saveNotice);
      setVerifyReport(completedVerifyReport ?? {
        version: 1,
        verdict: 'fail',
        entries: [{
          field: 'Verification',
          value: null,
          sourceBox: null,
          status: 'fail',
          message: 'No verification report was returned — fail. The MP4 remains available to download.',
        }],
      });
      setRenderState({
        stage: 'complete',
        progress: 1,
        message: savedOutputPath ? 'FFmpeg output saved and verified.' : 'Local MP4 ready.',
        outputUrl,
        outputBytes: blob.size,
      });
    } catch (error) {
      if (!ownsRender()) return;
      const baseMessage = error instanceof Error ? error.message : 'The local render failed.';
      const message = /code \d/.test(baseMessage) || !lastRenderLogRef.current
        ? baseMessage
        : `${baseMessage} ${lastRenderLogRef.current}`;
      if (job.cancelled || message === 'Render cancelled.') {
        setVerifyReport(null);
        setRenderState(INITIAL_RENDER_STATE);
      } else {
        setVerifyReport(null);
        setRenderState({ stage: 'error', progress: 0, message, outputUrl: null, outputBytes: null });
      }
    } finally {
      renderer.cancel();
      if (ownsRender()) {
        activeRenderRef.current = null;
        if (job.cancelled) setRenderState(INITIAL_RENDER_STATE);
      }
    }
  }

  async function prepareAdobeHandoff() {
    if (!project.clips.length || rendering) return;
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    renderedFingerprintRef.current = null;
    setVerifyReport(null);
    setOutputNotice('');
    setLatestOutputPath(null);
    setRenderState({ stage: 'preparing', progress: 0, message: 'Saving to Movies/Director and rendering with After Effects…', outputUrl: null, outputBytes: null });
    try {
      const handoff = await prepareDirectorAdobeHandoff(project, {
        onStage: (message) => setRenderState((current) => ({
          ...current,
          stage: 'preparing',
          message,
        })),
        onProgress: (progress) => setRenderState((current) => ({
          ...current,
          progress: Math.min(0.45, progress * 0.45),
        })),
        onLog: (message) => { lastRenderLogRef.current = message; },
      });
      onChange({ ...project, renderRequested: false });
      setRenderState((current) => ({
        ...current,
        progress: 0.5,
        message: 'Building the 32-bpc After Effects composition…',
      }));
      try {
        const result = await sendDirectorAdobeHandoffToLocalService(handoff);
        renderedFingerprintRef.current = fingerprint;
        if (result.adobe.status === 'rendered' || result.adobe.status === 'queued') {
          const codec = typeof result.adobe.receipt.deliveryCodec === 'string'
            ? result.adobe.receipt.deliveryCodec
            : typeof result.adobe.receipt.outputCodec === 'string'
              ? result.adobe.receipt.outputCodec
              : 'ProRes';
          const reportedBitDepth = typeof result.adobe.receipt.deliveryBitDepth === 'number'
            ? result.adobe.receipt.deliveryBitDepth
            : result.adobe.receipt.outputBitDepth;
          const bitDepth = typeof reportedBitDepth === 'number'
            ? ` ${reportedBitDepth}-bit`
            : '';
          if (result.adobe.status === 'rendered') {
            setOutputNotice(`Rendered via After Effects as verified ${codec}${bitDepth}. Output: ${result.outputPath}`);
            setLatestOutputPath(result.outputPath);
            setRenderState({ stage: 'complete', progress: 1, message: 'Adobe output rendered and verified.', outputUrl: null, outputBytes: result.outputBytes ?? handoff.totalBytes });
          } else {
            setOutputNotice(`Built and queued in After Effects as ${codec}${bitDepth}. ${result.adobe.warning} Output: ${result.outputPath}`);
            setRenderState({ stage: 'complete', progress: 1, message: 'Queued in After Effects.', outputUrl: null, outputBytes: handoff.totalBytes });
          }
          return;
        }
        if (result.adobe.status === 'not-configured') {
          setOutputNotice(`Saved automatically to ${result.packagePath ?? 'Director’s private handoff cache'}.`);
          setRenderState({
            stage: 'error',
            progress: 0,
            message: `${result.adobe.error} The complete package is safe at ${result.packagePath ?? 'Director’s private handoff cache'}.`,
            outputUrl: null,
            outputBytes: handoff.totalBytes,
          });
          return;
        }
        setOutputNotice(`The complete package is safe at ${result.packagePath ?? 'Director’s private handoff cache'}.`);
        setRenderState({
          stage: 'error',
          progress: 0,
          message: result.adobe.error,
          outputUrl: null,
          outputBytes: handoff.totalBytes,
        });
        return;
      } catch (error) {
        if (!(error instanceof DirectorLocalAdobeUnavailableError)) throw error;
      }

      // Static/hosted builds have no trusted local process. Download one
      // complete ZIP to the browser's preset Downloads location without
      // invoking Chrome's protected directory picker.
      const archive = await zipDirectorAdobeHandoff(handoff);
      const outputUrl = URL.createObjectURL(archive);
      outputUrlRef.current = outputUrl;
      const anchor = document.createElement('a');
      anchor.href = outputUrl;
      anchor.download = adobeHandoffArchiveName(project.title);
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      renderedFingerprintRef.current = fingerprint;
      setOutputNotice('The local Adobe service was unavailable, so Director downloaded the complete package to your browser’s Downloads folder.');
      setRenderState({ stage: 'complete', progress: 1, message: 'Adobe package downloaded.', outputUrl, outputBytes: archive.size });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Director could not prepare the Adobe render.';
      setRenderState({ stage: 'error', progress: 0, message, outputUrl: null, outputBytes: null });
    }
  }

  async function showLatestOutputInFinder() {
    if (!latestOutputPath) return;
    try {
      await revealDirectorLocalOutput(latestOutputPath);
      setOutputNotice(`Finder opened with ${latestOutputPath.split('/').pop() ?? 'the Director output'} selected.`);
    } catch (error) {
      setOutputNotice(
        error instanceof Error ? error.message : 'Director could not reveal the output in Finder.',
      );
    }
  }

  function requestRender() {
    if (heavyEffectsNeedQuality) {
      setShowQualityWarning(true);
      return;
    }
    void render();
  }

  function cancelRender() {
    const job = activeRenderRef.current;
    if (!job || job.cancelled) return;
    job.cancelled = true;
    job.renderer.cancel();
    setVerifyReport(null);
    setRenderState((current) => ({ ...current, stage: 'cancelling', message: 'Stopping the local render safely…' }));
  }

  return (
    <section className="reel-studio" aria-label="Director Reel Studio">
      <header className="reel-studio-head">
        <div className="reel-studio-title">DIRECTOR</div>
        <div className="local-render-badge"><ShieldCheck size={12} /> Media stays on this device</div>
        <button type="button" className="icon-button" onClick={onClose} title="Back to direction board"><X size={17} /></button>
      </header>

      <div className="reel-studio-body">
        <div className="reel-preview-column">
          <ReelPreview
            project={project}
            fit={playerFit}
            onFitChange={onPlayerFitChange}
            simplifiedPreview={project.clips.some((clip) => pluginRegistry.getTransition(clip.transition)?.previewQuality === 'reduced')}
            editClipId={selectedClip?.id ?? null}
            editLayers={selectedClip?.textLayers}
            selectedLayerId={selectedTextLayerId}
            onSelectLayer={setSelectedTextLayerId}
            onChangeLayer={updateTextLayer}
            onDeleteLayer={removeTextLayer}
            onTimeChange={(time) => { playheadRef.current = time; }}
          />
        </div>

        <aside className="reel-inspector">
          <InspectorSection
            id="output"
            title="Output"
            meta={`${project.aspectRatio} · ${project.fps} fps`}
            open={inspectorSections.output}
            onToggle={onToggleInspectorSection}
          >
            <div className="reel-project-settings">
              <ReelSelect label="Format" value={project.aspectRatio} options={REEL_FORMATS} onChange={(aspectRatio) => commitProject({ ...project, aspectRatio })} />
              <ReelSelect label="Quality" value={project.quality} options={REEL_QUALITIES} onChange={(quality) => commitProject({ ...project, quality })} />
              <ReelSelect className="frame-rate-select" label="Frame rate" value={String(project.fps) as '24' | '30'} options={[
                { id: '24', label: '24 fps', description: 'Traditional film cadence.' },
                { id: '30', label: '30 fps', description: 'Smoother motion.' },
              ]} onChange={(fps) => commitProject({ ...project, fps: Number(fps) as 24 | 30 })} />
              <ReelSelect label="Render engine" value={effectiveRenderBackend(project)} options={[
                { id: 'ffmpeg', label: 'FFmpeg · free/local', description: 'Browser-local H.264 render. Available without Adobe.' },
                { id: 'after-effects', label: 'Adobe After Effects', description: '32-bpc local Adobe build through the existing MCP bridge.' },
              ]} onChange={(renderBackend) => commitProject({
                ...project,
                renderBackend,
                colorDepth: renderBackend === 'after-effects' ? 32 : 8,
              })} />
              {effectiveRenderBackend(project) === 'after-effects' && (
                <ReelSelect label="Adobe processing" value="32" options={[
                  { id: '32', label: '32 bpc float', description: 'Required for Director’s Adobe HDR workflow.' },
                ]} onChange={() => undefined} disabled />
              )}
              <p className="quality-note">{REEL_QUALITIES.find((item) => item.id === project.quality)?.description}</p>
              <p className="quality-note subtle">{effectiveRenderBackend(project) === 'after-effects'
                ? 'Director prepares selected structural effects with its exact render engine, then After Effects builds the 32-bpc Rec.2100 HLG composition and verified HEVC Main 10 HLG delivery.'
                : 'FFmpeg remains the free, local rendering path for users without Adobe.'}</p>
              <p className={`quality-estimate${effectiveRenderBackend(project) === 'ffmpeg' && (renderEstimate.oversized || renderEstimate.slow) ? ' warn' : ''}`}>
                <span>{dimensions.width}×{dimensions.height}</span>
                <span>{effectiveRenderBackend(project) === 'after-effects' ? 'Rendered by After Effects' : `${renderEstimate.durationLabel} to render`}</span>
                <span>{effectiveRenderBackend(project) === 'after-effects' ? 'Verified HLG master' : renderEstimate.bytesLabel}</span>
              </p>
              {effectiveRenderBackend(project) === 'ffmpeg' && (renderEstimate.oversized || renderEstimate.slow) && (
                <p className="quality-estimate-note">
                  {renderEstimate.oversized
                    ? 'This file may be too large for social uploads. Balanced or High is usually the better post.'
                    : 'This is a long wait on this device. Balanced renders the same edit far faster.'}
                </p>
              )}
              <p className="quality-note subtle">Estimates only — the real cost depends on your device and effect stack. File size follows duration and image detail, not the source JPG size.</p>
            </div>
          </InspectorSection>

          {selectedClip ? (
            <div className="clip-inspector">
              <div className="inspector-heading">
                <span><Scissors size={12} /> Clip · {selectedClipIds.length} selected</span>
                <strong title={selectedClipIds.length > 1 ? `${selectedClipIds.length} clips selected` : selectedClip.title}>
                  {selectedClipIds.length > 1 ? `${selectedClipIds.length} clips` : selectedClip.title}
                </strong>
              </div>

              <InspectorSection id="look" title="Look" open={inspectorSections.look} onToggle={onToggleInspectorSection}>
                <ReelStackControl
                  label="Color grade"
                  values={reelGradeStack(selectedClip)}
                  fallbackValue="clean"
                  options={REEL_GRADES}
                  onChange={(gradeStack) => updateClip(selectedClip.id, {
                    effect: gradeStack[0] || 'clean',
                    gradeStack,
                  })}
                />
                <ReelStackControl
                  label="Visual effect"
                  values={reelVisualEffectStack(selectedClip)}
                  emptyValue="none"
                  fallbackValue="none"
                  options={REEL_VISUAL_EFFECTS}
                  onChange={(visualEffectStack) => updateClip(selectedClip.id, {
                    visualEffect: visualEffectStack[0] || 'none',
                    visualEffectStack,
                  })}
                />
                {selectedEffectPlugins.map((plugin) => (
                  <PluginParamFields
                    key={plugin.id}
                    plugin={plugin}
                    values={resolvedPluginParams(
                      plugin,
                      selectedClip.pluginParams?.[plugin.id],
                      { intensity: selectedClip.intensity },
                    )}
                    excludeFields={plugin.id === sharedIntensityPluginId ? [] : ['intensity']}
                    onChange={(field, value) => updatePluginParam(
                      selectedClip.id,
                      plugin.id,
                      field,
                      value,
                      field === 'intensity' ? 'intensity' : undefined,
                    )}
                  />
                ))}
              </InspectorSection>

              <InspectorSection id="motion" title="Motion & transition" open={inspectorSections.motion} onToggle={onToggleInspectorSection}>
                <PluginPicker label="Camera move" kind="motion" value={selectedClip.motion} onChange={(motion) => updateClip(selectedClip.id, { motion })} />
                <PluginParamFields
                  plugin={selectedMotionPlugin}
                  values={selectedClip.pluginParams?.[selectedClip.motion]}
                  onChange={(field, value) => updatePluginParam(
                    selectedClip.id,
                    selectedClip.motion,
                    field,
                    value,
                  )}
                />
                <PluginPicker label="Transition" kind="transition" value={transitionClip?.transition || 'cut'} disabled={!hasEditableTransitionTarget} onChange={(nextTransition) => {
                  const transition = nextTransition;
                  const plugin = pluginRegistry.getTransition(transition);
                  const defaults = plugin ? safePluginParams(plugin) : {};
                  const defaultDuration = typeof defaults.duration === 'number' ? defaults.duration : 0.45;
                  updateClip(transitionClip?.id || selectedClip.id, {
                    transition,
                    transitionDuration: transition === 'cut'
                      ? 0
                      : Math.max(transitionClip?.transitionDuration || 0, defaultDuration),
                  });
                }} />
                <PluginParamFields
                  plugin={selectedTransitionPlugin}
                  values={transitionClip && selectedTransitionPlugin
                    ? resolvedPluginParams(
                      selectedTransitionPlugin,
                      transitionClip.pluginParams?.[transitionClip.transition],
                      { duration: transitionClip.transitionDuration },
                    )
                    : {}}
                  disabled={transitionClip?.transition === 'cut' || !hasEditableTransitionTarget}
                  onChange={(field, value) => updatePluginParam(
                    transitionClip?.id || selectedClip.id,
                    selectedTransitionPlugin?.id || '',
                    field,
                    value,
                    field === 'duration' ? 'transitionDuration' : undefined,
                  )}
                />
              </InspectorSection>

              <InspectorSection
                id="text"
                title="Text"
                meta={selectedClip.textLayers.length ? `${selectedClip.textLayers.length}` : undefined}
                open={inspectorSections.text}
                onToggle={onToggleInspectorSection}
              >
                <TextLayerInspector
                  layers={selectedClip.textLayers}
                  selectedLayerId={selectedTextLayerId}
                  clipDuration={selectedClip.duration}
                  canAdd={selectedClip.textLayers.length < MAX_TEXT_LAYERS_PER_CLIP}
                  onSelect={setSelectedTextLayerId}
                  onAdd={addTextLayer}
                  onChange={updateTextLayer}
                  onRemove={removeTextLayer}
                  onReorder={moveTextLayer}
                />
              </InspectorSection>

              <InspectorSection id="timing" title="Timing" open={inspectorSections.timing} onToggle={onToggleInspectorSection}>
                <label>Seconds<input type="number" min="1" max="12" step="0.1" value={selectedClip.duration} onChange={(event) => updateClip(selectedClip.id, { duration: Math.min(12, Math.max(1, Number(event.target.value))), durationWasUserSet: true })} /></label>
              </InspectorSection>
            </div>
          ) : <div className="clip-inspector-empty">Select a clip in the timeline to edit its look, motion, and timing.</div>}
        </aside>
      </div>

      <div className="reel-timeline-area">
        <div className="timeline-toolbar">
          <span><Scissors size={12} /> TIMELINE · {project.clips.length} clips · {duration.toFixed(1)} s · {selectedClipIds.length} selected</span>
          {onUseCanvasSelection && <button type="button" className="canvas-selection-button" onClick={onUseCanvasSelection} title="Replace the timeline with the currently selected canvas image(s)"><ImagePlus size={12} /> Use selected canvas ({canvasSelectionCount})</button>}
          {project.clips.length > 1 && <button type="button" onClick={() => onChange({ ...project, selectedClipIds: project.clips.map((clip) => clip.id) })}>Select all</button>}
          <div className="timeline-history">
            <button
              type="button"
              onClick={undoEdit}
              disabled={!canUndo(history)}
              title="Undo (⌘Z)"
              aria-label="Undo"
            ><Undo2 size={13} /> Undo</button>
            <button
              type="button"
              onClick={redoEdit}
              disabled={!canRedo(history)}
              title="Redo (⇧⌘Z)"
              aria-label="Redo"
            ><Redo2 size={13} /> Redo</button>
          </div>
          <label className="media-picker" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.currentTarget.querySelector('input')?.click(); }}><ImagePlus size={13} /> Add local images<input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={(event) => { addLocalImages(event.target.files); event.target.value = ''; }} /></label>
          <label className="media-picker" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.currentTarget.querySelector('input')?.click(); }}><Music size={13} /> {project.audio?.name || 'Add local music'}<input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/aac,audio/flac,audio/ogg,audio/webm,.mp3,.m4a,.aac,.wav,.flac,.ogg,.webm" onChange={(event) => { setAudio(event.target.files?.[0]); event.target.value = ''; }} /></label>
          {project.audio && <button type="button" onClick={() => commitProject({ ...project, audio: null })}><X size={12} /> Remove music</button>}
        </div>
        {mediaNotice && <div className="reel-media-notice" role="status">{mediaNotice}</div>}
        <div className="reel-timeline" role="listbox" aria-label="Reel clips" aria-multiselectable="true">
          {project.clips.map((clip, index) => (
            <article
              key={clip.id}
              data-testid={`timeline-clip-${clip.id}`}
              className={`timeline-clip ${selectedClipIds.includes(clip.id) ? 'selected' : ''}`}
              role="option"
              aria-selected={selectedClipIds.includes(clip.id)}
              tabIndex={0}
              onClick={(event) => selectClip(clip.id, event.metaKey || event.ctrlKey || event.shiftKey)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                selectClip(clip.id, event.metaKey || event.ctrlKey || event.shiftKey);
              }}
            >
              <img src={clip.imageUrl} alt={clip.title} />
              <div><b>{String(index + 1).padStart(2, '0')}</b><strong>{clip.title}</strong><span>{clip.duration.toFixed(1)}s · {[...reelGradeStack(clip), ...reelVisualEffectStack(clip)].map((id) => pluginRegistry.get(id)?.id ?? id).join(' + ')} · {pluginRegistry.getTransition(clip.transition)?.id ?? clip.transition}</span></div>
              <div className="timeline-clip-actions">
                <button type="button" title="Move earlier" disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveClip(index, -1); }}><ArrowUp size={12} /></button>
                <button type="button" title="Move later" disabled={index === project.clips.length - 1} onClick={(event) => { event.stopPropagation(); moveClip(index, 1); }}><ArrowDown size={12} /></button>
                <button type="button" title="Remove clip" onClick={(event) => { event.stopPropagation(); removeClip(clip.id); }}><Trash2 size={12} /></button>
              </div>
            </article>
          ))}
          {!project.clips.length && (
            <div className="timeline-empty">
              <ImagePlus size={18} />
              <span>Add local images, or return to the board and ask Director to place references.</span>
              <button type="button" className="timeline-empty-samples" disabled={loadingSamples} onClick={() => { void addSampleImages(); }}>
                {loadingSamples ? 'Loading samples…' : 'Start with sample images'}
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="reel-render-bar">
        <button type="button" className="back-board" onClick={onClose}><ArrowLeft size={14} /> Board</button>
        <div className="render-format">
          <span className="render-format-chip">{project.aspectRatio} · {dimensions.width}×{dimensions.height} · {effectiveRenderBackend(project) === 'after-effects' ? 'HDR master · HLG' : 'H.264'} · {project.fps}fps</span>
          <div className="render-detail-anchor">
            <button
              type="button"
              className="render-detail-toggle"
              aria-expanded={showRenderDetails}
              aria-label="Render engine details"
              onClick={() => setShowRenderDetails((open) => !open)}
            ><Info size={14} /></button>
            {showRenderDetails && (
              <>
                <button type="button" className="render-detail-backdrop" aria-label="Close render details" onClick={() => setShowRenderDetails(false)} />
                <div className="render-detail-popover" role="dialog" aria-label="Render engine details">
                  <h4>{renderBackendLabel(effectiveRenderBackend(project))}</h4>
                  <dl>
                    <div><dt>Engine</dt><dd>{effectiveRenderBackend(project) === 'after-effects' ? 'Director Adobe · local MCP bridge' : 'FFmpeg.wasm · single-thread'}</dd></div>
                    <div><dt>Precision</dt><dd>{effectiveRenderBackend(project) === 'after-effects' ? '32 bpc float composition' : '8-bit YUV 4:2:0 delivery'}</dd></div>
                    <div><dt>Upload</dt><dd>None — media stays on device</dd></div>
                    <div><dt>Processor</dt><dd>{capability.cores ? `${capability.cores} logical cores` : 'Managed by browser'}</dd></div>
                    <div><dt>Memory hint</dt><dd>{capability.memory ? `${capability.memory} GB` : 'Managed by browser'}</dd></div>
                  </dl>
                  <p className={effectiveRenderBackend(project) === 'ffmpeg' && constrainedHighQuality ? 'warn' : ''}>
                    {effectiveRenderBackend(project) === 'after-effects'
                      ? 'The Adobe path prepares a native After Effects composition; rendering is completed by the local Director Adobe bridge.'
                      : constrainedHighQuality
                      ? '1080p may be slow on this device — 720p is recommended.'
                      : 'This device can run the premium local effect engine.'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        {renderState.stage !== 'idle' && (
          <div className={`render-status ${renderState.stage}`} role="status" aria-live="polite">
            <div role="progressbar" aria-label="Local render progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(renderState.progress * 100)}><span style={{ width: `${Math.round(renderState.progress * 100)}%` }} /></div>
            <p>{renderState.stage === 'complete' ? <Check size={12} /> : renderState.stage !== 'error' ? <LoaderCircle size={12} className="spin" /> : <X size={12} />} {renderState.message} {formatBytes(renderState.outputBytes)}</p>
          </div>
        )}
        {verifyReport && <ExportVerifyPanel report={verifyReport} />}
        {outputNotice && <p className="quality-note subtle" role="status">{outputNotice}</p>}
        {showQualityWarning && heavyEffectsNeedQuality && !rendering && !renderState.outputUrl && (
          <div className="render-quality-warning" role="alert">
            <span>Heavy visual effects need High or Maximum to look right. {project.quality === 'draft' ? 'Draft' : 'Balanced'} will soften pixel-sort and grain texture.</span>
            <div>
              <button type="button" onClick={() => {
                setShowQualityWarning(false);
                commitProject({ ...project, quality: 'high' });
              }}>Switch to High</button>
              <button type="button" onClick={() => {
                setShowQualityWarning(false);
                void render();
              }}>Render {project.quality === 'draft' ? 'Draft' : 'Balanced'} anyway</button>
            </div>
          </div>
        )}
        <div className="still-export-anchor">
          {latestOutputPath && (
            <button
              type="button"
              className="still-export-toggle"
              onClick={() => { void showLatestOutputInFinder(); }}
            >
              <FolderOpen size={14} /> Show output
            </button>
          )}
          <button
            type="button"
            className="still-export-toggle"
            aria-expanded={showStillExport}
            disabled={!project.clips.length}
            onClick={() => setShowStillExport((open) => !open)}
          >
            <ImageIcon size={14} /> Save image
          </button>
          {showStillExport && (
            <>
              <button
                type="button"
                className="render-detail-backdrop"
                aria-label="Close still export"
                onClick={() => setShowStillExport(false)}
              />
              <StillExportPanel
                resolveTarget={resolveStillTarget}
                aspectRatio={project.aspectRatio}
                fps={project.fps}
                onClose={() => setShowStillExport(false)}
              />
            </>
          )}
        </div>
        {renderState.outputUrl ? (
          <a
            className="render-button complete"
            href={renderState.outputUrl}
            download={effectiveRenderBackend(project) === 'after-effects'
              ? adobeHandoffArchiveName(project.title)
              : latestOutputPath?.split('/').pop() ?? `director-open-${new Date().toISOString().slice(0, 10)}.mp4`}
          >
            <Download size={14} /> {effectiveRenderBackend(project) === 'after-effects'
              ? 'Download Adobe package'
              : latestOutputPath ? 'Download copy' : 'Download MP4'}
          </a>
        ) : rendering ? (
          effectiveRenderBackend(project) === 'after-effects'
            ? <button type="button" className="render-button" disabled><LoaderCircle size={14} className="spin" /> Rendering with After Effects…</button>
            : <button type="button" className="render-button cancel" disabled={renderState.stage === 'cancelling'} onClick={cancelRender}><X size={14} /> {renderState.stage === 'cancelling' ? 'Stopping…' : 'Cancel render'}</button>
        ) : (
          <button type="button" className={`render-button ${project.renderRequested ? 'requested' : ''}`} disabled={!project.clips.length} onClick={requestRender}>
            <Sparkles size={14} /> {project.renderRequested
              ? 'Director planned it · Confirm render'
              : effectiveRenderBackend(project) === 'after-effects'
                ? renderState.stage === 'error' ? 'Retry Adobe render' : 'Render with After Effects'
                : renderState.stage === 'error' ? 'Retry local render' : 'Render on this device'}
          </button>
        )}
      </footer>
    </section>
  );
}
