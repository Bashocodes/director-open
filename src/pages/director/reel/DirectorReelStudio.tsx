import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Download,
  ImagePlus,
  Laptop,
  LoaderCircle,
  Music,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { ReelEffect, ReelMotion, ReelTransition, ReelVisualEffect } from '../../../shared/directorSchemas';
import {
  REEL_FORMATS,
  REEL_GRADES,
  REEL_MOTIONS,
  REEL_QUALITIES,
  REEL_TRANSITIONS,
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
import { normalizeReelProject, reelDuration } from './project';
import { ReelPreview } from './ReelPreview';
import { ReelSelect } from './ReelSelect';
import { ReelStackControl } from './ReelStackControl';
import {
  INITIAL_RENDER_STATE,
  reelGradeStack,
  reelVisualEffectStack,
  type ReelClip,
  type ReelProject,
  type ReelRenderState,
} from './types';
import './DirectorReelStudio.css';

type Props = {
  project: ReelProject;
  onChange: (project: ReelProject) => void;
  onClose: () => void;
  canvasSelectionCount?: number;
  onUseCanvasSelection?: () => void;
};

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

export function DirectorReelStudio({ project, onChange, onClose, canvasSelectionCount = 0, onUseCanvasSelection }: Props) {
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
  const [mediaNotice, setMediaNotice] = useState('');
  const [showQualityWarning, setShowQualityWarning] = useState(false);
  const selectedClipIds = project.selectedClipIds.filter((id) => project.clips.some((clip) => clip.id === id));
  const selectedId = selectedClipIds[0];
  const selectedClip = project.clips.find((clip) => clip.id === selectedId) || null;
  const dimensions = reelDimensions(project.aspectRatio, project.quality);
  const duration = reelDuration(project);
  const rendering = ['loading', 'preparing', 'rendering', 'cancelling'].includes(renderState.stage);
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

  useEffect(() => () => {
    activeRenderRef.current?.renderer.cancel();
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
  }, []);

  useEffect(() => {
    if (!renderedFingerprintRef.current || renderedFingerprintRef.current === fingerprint) return;
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    renderedFingerprintRef.current = null;
    setRenderState(INITIAL_RENDER_STATE);
  }, [fingerprint]);

  useEffect(() => {
    if (!heavyEffectsNeedQuality) setShowQualityWarning(false);
  }, [heavyEffectsNeedQuality]);

  function commitProject(next: ReelProject) {
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
    });
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
    const clip = project.clips.find((item) => item.id === id);
    if (clip?.sourceFile) URL.revokeObjectURL(clip.imageUrl);
    const clips = project.clips.filter((item) => item.id !== id);
    const selected = selectedClipIds.filter((selectedClipId) => selectedClipId !== id);
    const fallback = clips[Math.min(indexOfClip(project.clips, id), Math.max(0, clips.length - 1))];
    commitProject({ ...project, clips, selectedClipIds: selected.length ? selected : fallback ? [fallback.id] : [] });
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
      caption: '',
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
    if (project.audio) URL.revokeObjectURL(project.audio.url);
    commitProject({ ...project, audio: nextAudio });
  }

  async function render() {
    if (!project.clips.length || rendering) return;
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    renderedFingerprintRef.current = null;
    setRenderState({ stage: 'loading', progress: 0, message: 'Starting local render…', outputUrl: null, outputBytes: null });
    const renderer = new BrowserFfmpegRenderer();
    const job = { id: ++renderIdRef.current, renderer, cancelled: false };
    activeRenderRef.current = job;
    const ownsRender = () => activeRenderRef.current?.id === job.id;
    const renderFingerprint = fingerprint;
    lastRenderLogRef.current = '';
    renderStartedAtRef.current = null;
    onChange({ ...project, renderRequested: false });
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
      const outputUrl = URL.createObjectURL(blob);
      outputUrlRef.current = outputUrl;
      renderedFingerprintRef.current = renderFingerprint;
      setRenderState({ stage: 'complete', progress: 1, message: 'Local MP4 ready.', outputUrl, outputBytes: blob.size });
    } catch (error) {
      if (!ownsRender()) return;
      const baseMessage = error instanceof Error ? error.message : 'The local render failed.';
      const message = /code \d/.test(baseMessage) || !lastRenderLogRef.current
        ? baseMessage
        : `${baseMessage} ${lastRenderLogRef.current}`;
      if (job.cancelled || message === 'Render cancelled.') {
        setRenderState(INITIAL_RENDER_STATE);
      } else {
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
          <ReelPreview project={project} />
          <div className="reel-capability">
            <Laptop size={13} />
            <span>{capability.cores ? `${capability.cores} logical cores` : 'Local processor'}</span>
            <span>{capability.memory ? `${capability.memory} GB memory hint` : 'Memory managed by browser'}</span>
            <span className={constrainedHighQuality ? 'compat' : 'ready'}>{constrainedHighQuality ? '1080p may be slow · 720p recommended' : 'Premium local effect engine'}</span>
          </div>
        </div>

        <aside className="reel-inspector">
          <div className="reel-project-settings">
            <ReelSelect label="Format" value={project.aspectRatio} options={REEL_FORMATS} onChange={(aspectRatio) => commitProject({ ...project, aspectRatio })} />
            <ReelSelect label="Quality" value={project.quality} options={REEL_QUALITIES} onChange={(quality) => commitProject({ ...project, quality })} />
            <ReelSelect className="frame-rate-select" label="Frame rate" value={String(project.fps) as '24' | '30'} options={[
              { id: '24', label: '24 fps', description: 'Traditional film cadence.' },
              { id: '30', label: '30 fps', description: 'Smoother motion.' },
            ]} onChange={(fps) => commitProject({ ...project, fps: Number(fps) as 24 | 30 })} />
            <p className="quality-note">{REEL_QUALITIES.find((item) => item.id === project.quality)?.description} File size follows duration and image detail—not the source JPG size.</p>
          </div>

          {selectedClip ? (
            <div className="clip-inspector">
              <div className="inspector-heading"><Scissors size={13} /><span>CLIP CONTROL · {selectedClipIds.length} SELECTED</span><strong>{selectedClipIds.length > 1 ? `${selectedClipIds.length} clips` : selectedClip.title}</strong></div>
              <ReelStackControl
                label="Color grade"
                values={reelGradeStack(selectedClip)}
                fallbackValue="clean"
                options={REEL_GRADES}
                onChange={(gradeStack) => updateClip(selectedClip.id, {
                  effect: (gradeStack[0] || 'clean') as ReelEffect,
                  gradeStack: gradeStack as ReelEffect[],
                })}
              />
              <ReelStackControl
                label="Visual effect"
                values={reelVisualEffectStack(selectedClip)}
                emptyValue="none"
                fallbackValue="none"
                options={REEL_VISUAL_EFFECTS}
                onChange={(visualEffectStack) => updateClip(selectedClip.id, {
                  visualEffect: (visualEffectStack[0] || 'none') as ReelVisualEffect,
                  visualEffectStack: visualEffectStack as ReelVisualEffect[],
                })}
              />
              <label>Strength <b>{selectedClip.intensity}%</b><input type="range" min="0" max="100" value={selectedClip.intensity} onChange={(event) => updateClip(selectedClip.id, { intensity: Number(event.target.value) })} /></label>
              <ReelSelect label="Camera move" value={selectedClip.motion} options={REEL_MOTIONS} onChange={(motion) => updateClip(selectedClip.id, { motion: motion as ReelMotion })} />
              <ReelSelect label="Transition" value={transitionClip?.transition || 'cut'} options={REEL_TRANSITIONS} disabled={!hasEditableTransitionTarget} onChange={(nextTransition) => {
                const transition = nextTransition as ReelTransition;
                updateClip(transitionClip?.id || selectedClip.id, { transition, transitionDuration: transition === 'cut' ? 0 : Math.max(transitionClip?.transitionDuration || 0, 0.45) });
              }} />
              <div className="clip-number-row">
                <label>Seconds<input type="number" min="1" max="12" step="0.1" value={selectedClip.duration} onChange={(event) => updateClip(selectedClip.id, { duration: Math.min(12, Math.max(1, Number(event.target.value))), durationWasUserSet: true })} /></label>
                <label>Blend<input type="number" min="0" max="2" step="0.05" disabled={transitionClip?.transition === 'cut' || !hasEditableTransitionTarget} value={transitionClip?.transitionDuration || 0} onChange={(event) => updateClip(transitionClip?.id || selectedClip.id, { transitionDuration: Math.min(2, Math.max(0, Number(event.target.value))) })} /></label>
              </div>
              <label>Caption<input type="text" maxLength={180} value={selectedClip.caption} placeholder="Optional on-screen line" onChange={(event) => updateClip(selectedClip.id, { caption: event.target.value })} /></label>
            </div>
          ) : <div className="clip-inspector-empty">Select a clip in the timeline.</div>}
        </aside>
      </div>

      <div className="reel-timeline-area">
        <div className="timeline-toolbar">
          <span><Scissors size={12} /> TIMELINE · {project.clips.length} clips · {duration.toFixed(1)} s · {selectedClipIds.length} selected</span>
          {onUseCanvasSelection && <button type="button" className="canvas-selection-button" onClick={onUseCanvasSelection} title="Replace the timeline with the currently selected canvas image(s)"><ImagePlus size={12} /> Use selected canvas ({canvasSelectionCount})</button>}
          {project.clips.length > 1 && <button type="button" onClick={() => onChange({ ...project, selectedClipIds: project.clips.map((clip) => clip.id) })}>Select all</button>}
          <label className="media-picker" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.currentTarget.querySelector('input')?.click(); }}><ImagePlus size={13} /> Add local images<input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple onChange={(event) => { addLocalImages(event.target.files); event.target.value = ''; }} /></label>
          <label className="media-picker" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.currentTarget.querySelector('input')?.click(); }}><Music size={13} /> {project.audio?.name || 'Add local music'}<input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/aac,audio/flac,audio/ogg,audio/webm,.mp3,.m4a,.aac,.wav,.flac,.ogg,.webm" onChange={(event) => { setAudio(event.target.files?.[0]); event.target.value = ''; }} /></label>
          {project.audio && <button type="button" onClick={() => { URL.revokeObjectURL(project.audio!.url); commitProject({ ...project, audio: null }); }}><X size={12} /> Remove music</button>}
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
              <div><b>{String(index + 1).padStart(2, '0')}</b><strong>{clip.title}</strong><span>{clip.duration.toFixed(1)}s · {[...reelGradeStack(clip), ...reelVisualEffectStack(clip)].join(' + ')} · {clip.transition}</span></div>
              <div className="timeline-clip-actions">
                <button type="button" title="Move earlier" disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveClip(index, -1); }}><ArrowUp size={12} /></button>
                <button type="button" title="Move later" disabled={index === project.clips.length - 1} onClick={(event) => { event.stopPropagation(); moveClip(index, 1); }}><ArrowDown size={12} /></button>
                <button type="button" title="Remove clip" onClick={(event) => { event.stopPropagation(); removeClip(clip.id); }}><Trash2 size={12} /></button>
              </div>
            </article>
          ))}
          {!project.clips.length && <div className="timeline-empty"><ImagePlus size={18} /> Add local images or return to the board and ask Director to place references.</div>}
        </div>
      </div>

      <footer className="reel-render-bar">
        <button type="button" className="back-board" onClick={onClose}><ArrowLeft size={14} /> Direction board</button>
        <div className="render-summary">
          <span>{dimensions.width}×{dimensions.height} · H.264 MP4 · {project.fps} fps</span>
          <small>FFmpeg premium local worker · zero media upload</small>
        </div>
        {renderState.stage !== 'idle' && (
          <div className={`render-status ${renderState.stage}`} role="status" aria-live="polite">
            <div role="progressbar" aria-label="Local render progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(renderState.progress * 100)}><span style={{ width: `${Math.round(renderState.progress * 100)}%` }} /></div>
            <p>{renderState.stage === 'complete' ? <Check size={12} /> : renderState.stage !== 'error' ? <LoaderCircle size={12} className="spin" /> : <X size={12} />} {renderState.message} {formatBytes(renderState.outputBytes)}</p>
          </div>
        )}
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
        {renderState.outputUrl ? (
          <a className="render-button complete" href={renderState.outputUrl} download={`director-open-${new Date().toISOString().slice(0, 10)}.mp4`}><Download size={14} /> Download MP4</a>
        ) : rendering ? (
          <button type="button" className="render-button cancel" disabled={renderState.stage === 'cancelling'} onClick={cancelRender}><X size={14} /> {renderState.stage === 'cancelling' ? 'Stopping…' : 'Cancel render'}</button>
        ) : (
          <button type="button" className={`render-button ${project.renderRequested ? 'requested' : ''}`} disabled={!project.clips.length} onClick={requestRender}>
            <Sparkles size={14} /> {project.renderRequested ? 'Director planned it · Confirm render' : renderState.stage === 'error' ? 'Retry local render' : 'Render on this device'}
          </button>
        )}
      </footer>
    </section>
  );
}
