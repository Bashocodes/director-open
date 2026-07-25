import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, Scan, Square } from 'lucide-react';
import {
  pluginRegistry,
  resolvedPluginParams,
} from '../../../plugins/registry';
import type { PlayerFit } from '../workspaceLayout';
import type { TextLayer } from '../../../shared/directorSchemas';
import { clampPlayhead, keyToPlayerAction } from './playerControls';
import { useFullscreen } from './useFullscreen';
import { TextLayerOverlay } from './TextLayerOverlay';
import { ensureTextFontsReady } from '../../../lib/text/loadFonts';
import { renderTransitionFrame } from '../../../plugins/transitions/transitionKit';
import { compositeClipBoundary } from './transitionBoundary';
import { compileReelTimeline, reelDuration } from './project';
import { type ReelProject } from './types';
import {
  composeClipFrame,
  resizeCanvas,
  type ClipFrameScratch,
} from './clipFrameComposer';

function previewDimensions(aspect: ReelProject['aspectRatio']) {
  if (aspect === '9:16') return { width: 540, height: 960 };
  if (aspect === '16:9') return { width: 960, height: 540 };
  return { width: 720, height: 720 };
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

type ReelPreviewProps = {
  project: ReelProject;
  fit?: PlayerFit;
  onFitChange?: (fit: PlayerFit) => void;
  simplifiedPreview?: boolean;
  editClipId?: string | null;
  editLayers?: TextLayer[];
  selectedLayerId?: string | null;
  onSelectLayer?: (id: string | null) => void;
  onChangeLayer?: (layer: TextLayer) => void;
  onDeleteLayer?: (id: string) => void;
  /** Reports the playhead so a still export can capture the exact frame on screen. */
  onTimeChange?: (time: number) => void;
};

export function ReelPreview({
  project,
  fit = 'fit',
  onFitChange,
  simplifiedPreview = false,
  editClipId = null,
  editLayers,
  selectedLayerId = null,
  onSelectLayer,
  onChangeLayer,
  onDeleteLayer,
  onTimeChange,
}: ReelPreviewProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const clipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gradeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const startTimeRef = useRef(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const [fontsReady, setFontsReady] = useState(false);
  const { supported: fullscreenSupported, isFullscreen, toggle: toggleFullscreen } = useFullscreen(shellRef);
  const [controlsVisible, setControlsVisible] = useState(true);
  const idleTimerRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const dimensions = previewDimensions(project.aspectRatio);
  const duration = reelDuration(project);
  const timeline = useMemo(() => compileReelTimeline(project), [project]);
  const imageSourceKey = project.clips.map((clip) => `${clip.id}:${clip.imageUrl}`).join('|');

  useEffect(() => {
    let active = true;
    project.clips.forEach((clip) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        if (active) setImages((current) => ({ ...current, [clip.id]: image }));
      };
      image.src = clip.imageUrl;
    });
    setImages((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => project.clips.some((clip) => clip.id === id)),
    ));
    return () => { active = false; };
  }, [imageSourceKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.save();
    context.fillStyle = '#07070a';
    context.fillRect(0, 0, canvas.width, canvas.height);
    delete canvas.dataset.pixelSortPreviewMs;
    delete canvas.dataset.pixelSortPreviewWorkSize;
    delete canvas.dataset.pixelSortPreviewScale;
    delete canvas.dataset.pixelSortMorphologyFrame;
    delete canvas.dataset.pixelSortPhase;
    delete canvas.dataset.pixelSortCacheHit;

    // Per-pixel transition pre-pass: when the playhead is inside a per-pixel
    // transition window, draw ONE blended full-frame (the same renderTransitionFrame
    // + boundary compositor the export uses) and skip the normal clip loop.
    for (let index = 1; index < project.clips.length; index += 1) {
      const clip = project.clips[index];
      const overlap = timeline.clips[index].incomingOverlap;
      const plugin = pluginRegistry.getTransition(clip.transition);
      if (!plugin?.renderFrame || overlap <= 0) continue;
      const winStart = timeline.clips[index].start;
      if (time < winStart || time > winStart + overlap) continue;
      const previous = project.clips[index - 1];
      const imagePrev = images[previous.id];
      const imageCur = images[clip.id];
      if (!imagePrev || !imageCur) continue;
      const scale = plugin.previewQuality === 'reduced' ? 0.5 : 1;
      const workWidth = Math.max(2, Math.round(canvas.width * scale));
      const workHeight = Math.max(2, Math.round(canvas.height * scale));
      const frameA = compositeClipBoundary(imagePrev, imagePrev.naturalWidth, imagePrev.naturalHeight, previous, workWidth, workHeight, 'out');
      const frameB = compositeClipBoundary(imageCur, imageCur.naturalWidth, imageCur.naturalHeight, clip, workWidth, workHeight, 'in');
      const params = resolvedPluginParams(plugin, clip.pluginParams?.[clip.transition], { duration: overlap });
      const rgba = renderTransitionFrame(plugin, {
        frameA, frameB, rawProgress: (time - winStart) / overlap, width: workWidth, height: workHeight, params,
      });
      const work = document.createElement('canvas');
      work.width = workWidth;
      work.height = workHeight;
      const workContext = work.getContext('2d');
      if (workContext) {
        const imageData = workContext.createImageData(workWidth, workHeight);
        imageData.data.set(rgba);
        workContext.putImageData(imageData, 0, 0);
        context.imageSmoothingEnabled = scale !== 1;
        context.drawImage(work, 0, 0, canvas.width, canvas.height);
      }
      context.restore();
      return;
    }

    project.clips.forEach((clip, index) => {
      const timelineClip = timeline.clips[index];
      const start = timelineClip.start;
      const local = time - start;
      if (local < 0 || local > clip.duration) return;
      const image = images[clip.id];
      if (!image) return;
      const progress = Math.min(1, Math.max(0, local / clip.duration));
      const transition = timelineClip.incomingOverlap;
      const transitionPlugin = pluginRegistry.getTransition(clip.transition)
        ?? pluginRegistry.getTransition('crossfade');
      const transitionState = transitionPlugin?.preview({
        progress: transition > 0 ? Math.min(1, local / transition) : 1,
        width: canvas.width,
        height: canvas.height,
        params: resolvedPluginParams(
          transitionPlugin,
          clip.pluginParams?.[clip.transition],
          { duration: clip.transitionDuration },
        ),
      }) ?? {
        opacity: 1,
        translateX: 0,
        translateY: 0,
        scale: 1,
      };

      let clipCanvas = clipCanvasRef.current;
      if (!clipCanvas) {
        clipCanvas = document.createElement('canvas');
        clipCanvasRef.current = clipCanvas;
      }
      resizeCanvas(clipCanvas, canvas.width, canvas.height);
      const clipContext = clipCanvas.getContext('2d');
      if (!clipContext) return;
      const scratch: ClipFrameScratch = {
        pixel: pixelCanvasRef.current ?? undefined,
        grade: gradeCanvasRef.current ?? undefined,
      };
      const structuralEffectMetrics = composeClipFrame({
        context: clipContext,
        image,
        clip,
        width: clipCanvas.width,
        height: clipCanvas.height,
        progress,
        localTime: local,
        fps: project.fps,
        fidelity: 'player',
        scratch,
      });
      pixelCanvasRef.current = scratch.pixel ?? null;
      gradeCanvasRef.current = scratch.grade ?? null;

      if (structuralEffectMetrics) {
        canvas.dataset.pixelSortPreviewMs = structuralEffectMetrics.sortMs.toFixed(2);
        canvas.dataset.pixelSortPreviewWorkSize = `${structuralEffectMetrics.workWidth}x${structuralEffectMetrics.workHeight}`;
        canvas.dataset.pixelSortPreviewScale = structuralEffectMetrics.scale.toFixed(3);
        canvas.dataset.pixelSortMorphologyFrame = String(structuralEffectMetrics.morphologyFrame);
        canvas.dataset.pixelSortPhase = structuralEffectMetrics.phase.toFixed(3);
        canvas.dataset.pixelSortCacheHit = String(structuralEffectMetrics.cacheHit);
      }

      context.save();
      context.globalAlpha = transitionState.opacity;
      context.translate(transitionState.translateX, transitionState.translateY);
      context.scale(transitionState.scale, transitionState.scale);
      context.drawImage(clipCanvas, 0, 0);
      context.restore();
    });
    context.restore();
  }, [project, time, timeline, images, fontsReady]);

  useEffect(() => {
    onTimeChange?.(time);
  }, [time, onTimeChange]);

  useEffect(() => {
    let active = true;
    void ensureTextFontsReady().then(() => { if (active) setFontsReady(true); });
    return () => { active = false; };
  }, []);

  // When a clip is selected for text editing, seek the preview to that clip so
  // its handles overlay the frame they actually edit (not the playhead's clip).
  useEffect(() => {
    if (!editClipId || playing) return;
    const index = project.clips.findIndex((clip) => clip.id === editClipId);
    if (index < 0) return;
    const start = timeline.clips[index]?.start ?? 0;
    const end = start + project.clips[index].duration;
    if (time < start || time >= end) {
      const next = start + 0.01;
      setTime(next);
      if (audioRef.current) audioRef.current.currentTime = next;
    }
    // Intentionally keyed only on the selected clip, so scrubbing afterwards is free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editClipId]);

  useEffect(() => {
    if (!playing) return;
    startedAtRef.current = performance.now();
    startTimeRef.current = time;
    const tick = (now: number) => {
      const next = startTimeRef.current + (now - startedAtRef.current) / 1_000;
      if (next >= duration) {
        setTime(0);
        setPlaying(false);
        audioRef.current?.pause();
        return;
      }
      setTime(next);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); };
  }, [playing, duration]);

  activeRef.current = playing || isFullscreen;

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    // Only auto-hide while the reel is playing or expanded to fullscreen.
    idleTimerRef.current = window.setTimeout(() => {
      if (activeRef.current) setControlsVisible(false);
    }, 2000);
  }, []);

  useEffect(() => {
    if (!playing && !isFullscreen) {
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      setControlsVisible(true);
    }
  }, [playing, isFullscreen]);

  useEffect(() => () => { if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current); }, []);

  function scrubBy(delta: number) {
    setTime((current) => {
      const next = clampPlayhead(current + delta, duration);
      if (audioRef.current) audioRef.current.currentTime = next;
      return next;
    });
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const action = keyToPlayerAction({ key: event.key, shiftKey: event.shiftKey }, { fps: project.fps });
    if (!action) return;
    event.preventDefault();
    if (action.type === 'toggle-play') togglePlayback();
    else scrubBy(action.delta);
  }

  function togglePlayback() {
    if (!project.clips.length) return;
    if (playing) {
      setPlaying(false);
      audioRef.current?.pause();
      return;
    }
    if (time >= duration) setTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      void audioRef.current.play().catch(() => undefined);
    }
    setPlaying(true);
  }

  return (
    <div
      ref={shellRef}
      className={`reel-preview-shell ${isFullscreen ? 'fullscreen' : ''} ${controlsVisible ? '' : 'controls-hidden'}`}
      tabIndex={0}
      role="group"
      aria-label="Reel preview player"
      onKeyDown={handleKeyDown}
      onPointerMove={revealControls}
    >
      <div
        className={`reel-preview-frame aspect-${project.aspectRatio.replace(':', '-')} fit-${fit}`}
        onDoubleClick={() => fullscreenSupported && toggleFullscreen()}
      >
        <canvas ref={canvasRef} width={dimensions.width} height={dimensions.height} aria-label="Local reel preview" />
        {!project.clips.length && <div className="reel-preview-empty">Add images to begin the edit.</div>}
        {simplifiedPreview && <div className="reel-preview-note">Preview simplified — export is full quality</div>}
        {editLayers && editLayers.length > 0 && !playing && onSelectLayer && onChangeLayer && onDeleteLayer && (
          <TextLayerOverlay
            layers={editLayers}
            selectedLayerId={selectedLayerId}
            onSelect={onSelectLayer}
            onChange={onChangeLayer}
            onDelete={onDeleteLayer}
          />
        )}
      </div>
      {project.audio && <audio ref={audioRef} src={project.audio.url} loop preload="metadata" />}
      <div className="reel-playback">
        <button type="button" onClick={togglePlayback} disabled={!project.clips.length} aria-label={playing ? 'Pause preview' : 'Play preview'}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <span>{formatTime(time)}</span>
        <input
          aria-label="Preview playhead"
          type="range"
          min="0"
          max={Math.max(duration, 0.01)}
          step="0.01"
          value={Math.min(time, duration)}
          onChange={(event) => {
            const next = Number(event.target.value);
            setTime(next);
            if (audioRef.current) audioRef.current.currentTime = next;
          }}
        />
        <span>{formatTime(duration)}</span>
        {onFitChange && (
          <button
            type="button"
            className="reel-player-tool"
            aria-pressed={fit === 'fill'}
            title={fit === 'fill' ? 'Fill frame — switch to fit' : 'Fit frame — switch to fill'}
            aria-label={fit === 'fill' ? 'Switch preview to fit' : 'Switch preview to fill'}
            onClick={() => onFitChange(fit === 'fill' ? 'fit' : 'fill')}
          >
            {fit === 'fill' ? <Scan size={14} /> : <Square size={14} />}
          </button>
        )}
        {fullscreenSupported && (
          <button
            type="button"
            className="reel-player-tool"
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen preview'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
