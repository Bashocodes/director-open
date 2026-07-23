import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { drawReelCaption } from './caption';
import { compileReelTimeline, reelDuration } from './project';
import { reelGradeStack, reelVisualEffectStack, type ReelClip, type ReelProject } from './types';
import {
  applyPreviewGradeFinish,
  applyPreviewStructuralEffects,
  applyPreviewVisualEffect,
  previewGradeFilter,
  type PixelSortPreviewMetrics,
} from './previewEffects';
import { cameraPoseAt } from './motionRecipes';
import { isStructuralEffect, structuralEffectIds } from './structuralEffects';

function previewDimensions(aspect: ReelProject['aspectRatio']) {
  if (aspect === '9:16') return { width: 540, height: 960 };
  if (aspect === '16:9') return { width: 960, height: 540 };
  return { width: 720, height: 720 };
}
function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  clip: ReelClip,
  progress: number,
) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (sourceRatio > targetRatio) drawWidth = height * sourceRatio;
  else drawHeight = width / sourceRatio;

  const pose = cameraPoseAt(clip.motion, progress);
  const overflowX = Math.max(0, drawWidth * pose.zoom - width);
  const overflowY = Math.max(0, drawHeight * pose.zoom - height);
  context.drawImage(
    image,
    -overflowX * pose.focusX,
    -overflowY * pose.focusY,
    drawWidth * pose.zoom,
    drawHeight * pose.zoom,
  );
}

function drawCenteredCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  const drawWidth = sourceRatio > targetRatio ? height * sourceRatio : width;
  const drawHeight = sourceRatio > targetRatio ? height : width / sourceRatio;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawCameraFrame(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  clip: ReelClip,
  progress: number,
) {
  const pose = cameraPoseAt(clip.motion, progress);
  const drawWidth = width * pose.zoom;
  const drawHeight = height * pose.zoom;
  const overflowX = Math.max(0, drawWidth - width);
  const overflowY = Math.max(0, drawHeight - height);
  context.drawImage(source, -overflowX * pose.focusX, -overflowY * pose.focusY, drawWidth, drawHeight);
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

export function ReelPreview({ project }: { project: ReelProject }) {
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
    project.clips.forEach((clip, index) => {
      const timelineClip = timeline.clips[index];
      const start = timelineClip.start;
      const local = time - start;
      if (local < 0 || local > clip.duration) return;
      const image = images[clip.id];
      if (!image) return;
      const progress = Math.min(1, Math.max(0, local / clip.duration));
      const transition = timelineClip.incomingOverlap;
      let opacity = transition > 0 ? Math.min(1, local / transition) : 1;
      let translateX = 0;
      if (transition > 0 && clip.transition === 'dip-black') opacity = Math.min(1, local / (transition * 0.5));
      if (transition > 0 && clip.transition === 'slide-left') translateX = canvas.width * (1 - opacity);
      if (transition > 0 && clip.transition === 'slide-right') translateX = -canvas.width * (1 - opacity);

      let clipCanvas = clipCanvasRef.current;
      if (!clipCanvas) {
        clipCanvas = document.createElement('canvas');
        clipCanvasRef.current = clipCanvas;
      }
      resizeCanvas(clipCanvas, canvas.width, canvas.height);
      const clipContext = clipCanvas.getContext('2d');
      if (!clipContext) return;
      clipContext.clearRect(0, 0, clipCanvas.width, clipCanvas.height);
      const grades = reelGradeStack(clip);
      const gradeFilters = grades
        .map((effect) => previewGradeFilter(effect, clip.intensity))
        .filter((value) => value !== 'none');
      clipContext.filter = 'none';
      const visualEffects = reelVisualEffectStack(clip);
      const structuralEffects = structuralEffectIds(visualEffects);
      let structuralEffectMetrics: PixelSortPreviewMetrics | undefined;
      if (structuralEffects.length > 0) {
        let pixelCanvas = pixelCanvasRef.current;
        if (!pixelCanvas) {
          pixelCanvas = document.createElement('canvas');
          pixelCanvasRef.current = pixelCanvas;
        }
        resizeCanvas(pixelCanvas, clipCanvas.width, clipCanvas.height);
        const pixelContext = pixelCanvas.getContext('2d');
        if (!pixelContext) return;
        pixelContext.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);
        pixelContext.filter = 'none';
        drawCenteredCover(pixelContext, image, pixelCanvas.width, pixelCanvas.height);
        structuralEffectMetrics = applyPreviewStructuralEffects({
          context: pixelContext,
          clip,
          effects: structuralEffects,
          width: pixelCanvas.width,
          height: pixelCanvas.height,
          progress,
          fps: project.fps,
        });
        drawCameraFrame(clipContext, pixelCanvas, clipCanvas.width, clipCanvas.height, clip, progress);
      } else {
        drawCover(clipContext, image, clipCanvas.width, clipCanvas.height, clip, progress);
      }
      visualEffects.filter((effect) => !isStructuralEffect(effect)).forEach((effect) => applyPreviewVisualEffect({
        context: clipContext,
        clip,
        effect,
        width: clipCanvas.width,
        height: clipCanvas.height,
        progress,
        fps: project.fps,
      }));
      if (gradeFilters.length > 0) {
        let gradeCanvas = gradeCanvasRef.current;
        if (!gradeCanvas) {
          gradeCanvas = document.createElement('canvas');
          gradeCanvasRef.current = gradeCanvas;
        }
        resizeCanvas(gradeCanvas, clipCanvas.width, clipCanvas.height);
        const gradeContext = gradeCanvas.getContext('2d');
        if (!gradeContext) return;
        gradeContext.clearRect(0, 0, gradeCanvas.width, gradeCanvas.height);
        gradeContext.filter = gradeFilters.join(' ');
        gradeContext.drawImage(clipCanvas, 0, 0);
        gradeContext.filter = 'none';
        clipContext.clearRect(0, 0, clipCanvas.width, clipCanvas.height);
        clipContext.drawImage(gradeCanvas, 0, 0);
      }
      grades.forEach((effect) => applyPreviewGradeFinish(
        clipContext,
        effect,
        clip.intensity,
        clipCanvas.width,
        clipCanvas.height,
      ));
      drawReelCaption(clipContext, clip.caption, clipCanvas.width, clipCanvas.height);

      if (structuralEffectMetrics) {
        canvas.dataset.pixelSortPreviewMs = structuralEffectMetrics.sortMs.toFixed(2);
        canvas.dataset.pixelSortPreviewWorkSize = `${structuralEffectMetrics.workWidth}x${structuralEffectMetrics.workHeight}`;
        canvas.dataset.pixelSortPreviewScale = structuralEffectMetrics.scale.toFixed(3);
        canvas.dataset.pixelSortMorphologyFrame = String(structuralEffectMetrics.morphologyFrame);
        canvas.dataset.pixelSortPhase = structuralEffectMetrics.phase.toFixed(3);
        canvas.dataset.pixelSortCacheHit = String(structuralEffectMetrics.cacheHit);
      }

      context.save();
      context.globalAlpha = opacity;
      context.translate(translateX, 0);
      context.drawImage(clipCanvas, 0, 0);
      context.restore();
    });
    context.restore();
  }, [project, time, timeline, images]);

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
    <div className="reel-preview-shell">
      <div className={`reel-preview-frame aspect-${project.aspectRatio.replace(':', '-')}`}>
        <canvas ref={canvasRef} width={dimensions.width} height={dimensions.height} aria-label="Local reel preview" />
        {!project.clips.length && <div className="reel-preview-empty">Add images to begin the edit.</div>}
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
      </div>
    </div>
  );
}
