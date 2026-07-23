import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { ReelEffect, ReelMotion, ReelTransition, ReelVisualEffect } from '../../../shared/directorSchemas';
import { reelDimensions } from './catalog';
import { drawReelCaption } from './caption';
import {
  assertKnownMediaLimits,
  imageExtension,
  imageExtensionFromMimeType,
  MAX_AGGREGATE_INPUT_BYTES,
  MAX_IMAGE_BYTES,
} from './media';
import { compileReelTimeline, reelDuration } from './project';
import { reelGradeStack, reelVisualEffectStack, type ReelClip, type ReelProject } from './types';
import {
  effectSeed,
  effectStrength,
  mix,
  opticalFfmpegRecipe,
  structuralEffectFps,
} from './effectRecipes';
import { makeStructuralEffectFrameSequence } from './structuralEffectEngine';
import { isStructuralEffect, structuralEffectIds } from './structuralEffects';
import { cameraFfmpegExpressions } from './motionRecipes';

const CORE_VERSION = '0.12.10';
const CDN_ROOT = 'https://cdn.jsdelivr.net/npm';
const CORE_LOAD_TIMEOUT_MS = 90_000;
const MAX_CORE_ASSET_BYTES = 64 * 1_048_576;
// zoompan only needs enough source overscan for Director's largest 1.16× move.
// The former 2× workspace made a layered pixel-sort render hold multiple
// 2160×3840 streams in ffmpeg.wasm at once, which can exhaust WebAssembly's
// address space and end as the opaque `Aborted()` error shown by FFmpeg.
const MOTION_OVERSCAN = 1.18;

type RenderCallbacks = {
  onStage: (stage: 'loading' | 'preparing' | 'rendering', message: string) => void;
  onProgress: (progress: number) => void;
  onLog?: (message: string) => void;
};

type StructuralEffectInputIndexes = Array<number | null>;

export type FfmpegCommandPlan = {
  args: string[];
  filterGraph: string;
  outputName: string;
  duration: number;
};

const HEAVY_VISUAL_EFFECTS = new Set<ReelVisualEffect>([
  'pixel-sort',
  'glitch-burst',
  'crt-scan',
  'halftone-reveal',
  'ripple-drift',
  'motion-echo',
  'threshold-melt',
]);
const TEXTURE_CRITICAL_EFFECTS = new Set<ReelVisualEffect>([
  'pixel-sort', 'crt-scan', 'halftone-reveal', 'threshold-melt',
]);

export function hasHeavyVisualEffects(project: ReelProject) {
  return project.clips.some((clip) =>
    reelVisualEffectStack(clip).some((effect) => HEAVY_VISUAL_EFFECTS.has(effect)),
  );
}

export function renderTimeoutMs(project: ReelProject) {
  const duration = reelDuration(project);
  const hasHeavyEffects = hasHeavyVisualEffects(project);
  if (hasHeavyEffects) {
    return Math.max(300_000, Math.min(1_200_000, duration * 60_000));
  }
  return Math.max(120_000, Math.min(900_000, duration * 25_000));
}

function fixed(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function gradeFilters(effect: ReelEffect, intensity: number) {
  const amount = Math.min(100, Math.max(0, intensity)) / 100;
  const mix = (low: number, high: number) => fixed(low + (high - low) * amount);
  switch (effect) {
    case 'cinematic':
      return `curves=all='0/0 0.12/${mix(0.12, 0.095)} 0.5/${mix(0.5, 0.515)} 0.86/${mix(0.86, 0.895)} 1/1',`
        + `colorbalance=rs=-${mix(0, 0.018)}:bs=${mix(0, 0.026)}:rh=${mix(0, 0.028)}:bh=-${mix(0, 0.018)},`
        + `eq=saturation=${mix(0.995, 0.92)}:gamma=${mix(1, 0.985)},vignette=angle=${mix(0.26, 0.46)}`;
    case 'hdr':
      return `curves=all='0/0 0.12/${mix(0.12, 0.095)} 0.5/${mix(0.5, 0.525)} 0.82/${mix(0.82, 0.875)} 0.96/${mix(0.96, 0.975)} 1/1',`
        + `eq=saturation=${mix(1.005, 1.085)}:gamma=${mix(1, 0.992)},unsharp=7:7:${mix(0.12, 0.52)}:5:5:0`;
    case 'warm':
      return `colorbalance=rs=${mix(0.008, 0.065)}:gs=${mix(0.003, 0.022)}:bs=-${mix(0.008, 0.045)},`
        + `curves=all='0/0 0.2/${mix(0.2, 0.18)} 0.78/${mix(0.78, 0.82)} 1/1'`;
    case 'cool':
      return `colorbalance=rs=-${mix(0.008, 0.05)}:bs=${mix(0.01, 0.075)},`
        + `curves=all='0/0 0.18/${mix(0.18, 0.155)} 0.8/${mix(0.8, 0.84)} 1/1',eq=saturation=${mix(1, 0.94)}`;
    case 'mono':
      return `hue=s=0,curves=all='0/0 0.18/${mix(0.18, 0.13)} 0.52/${mix(0.52, 0.55)} 0.84/${mix(0.84, 0.9)} 1/1'`;
    case 'dream':
      return `gblur=sigma=${mix(0.25, 2.4)},eq=saturation=${mix(0.98, 0.72)}:gamma=${mix(1.01, 1.11)}`;
    case 'vignette':
      return `vignette=angle=${mix(0.32, 0.82)}`;
    case 'blur':
      return `gblur=sigma=${mix(0.35, 9)}`;
    case 'punch':
      return `curves=all='0/0 0.16/${mix(0.155, 0.115)} 0.5/${mix(0.5, 0.515)} 0.86/${mix(0.86, 0.915)} 1/1',`
        + `eq=saturation=${mix(1.005, 1.14)},unsharp=7:7:${mix(0.14, 0.64)}:5:5:0`;
    case 'teal-orange':
      return `colorbalance=rs=${mix(0.006, 0.045)}:gs=-${mix(0.002, 0.015)}:bs=${mix(0.006, 0.04)},`
        + `curves=all='0/0 0.18/${mix(0.18, 0.145)} 0.82/${mix(0.82, 0.875)} 1/1',eq=saturation=${mix(1, 1.09)}`;
    case 'vintage-film':
      return `colorbalance=rs=${mix(0.006, 0.05)}:gs=${mix(0.003, 0.025)}:bs=-${mix(0.006, 0.04)},`
        + `curves=all='0/${mix(0, 0.035)} 0.2/${mix(0.2, 0.215)} 0.8/${mix(0.8, 0.78)} 1/${mix(1, 0.96)}',`
        + `eq=saturation=${mix(1, 0.82)},noise=alls=${mix(0, 5.5)}:allf=t`;
    case 'glow':
      return `gblur=sigma=${mix(0.05, 1.25)},eq=brightness=${mix(0, 0.035)}:gamma=${mix(1, 1.08)}:saturation=${mix(1, 1.08)}`;
    case 'bleach-bypass':
      return `curves=all='0/0 0.17/${mix(0.165, 0.105)} 0.5/${mix(0.5, 0.52)} 0.84/${mix(0.84, 0.92)} 1/1',`
        + `eq=saturation=${mix(0.96, 0.56)},unsharp=5:5:${mix(0.1, 0.55)}:5:5:0`;
    case 'clean':
    default:
      return 'null';
  }
}

function appendCrtScanStage(options: {
  filterParts: string[];
  inputLabel: string;
  outputLabel: string;
  stageId: string;
  clip: ReelClip;
  fps: number;
}) {
  const { filterParts, inputLabel, outputLabel, stageId, clip, fps } = options;
  const strength = effectStrength(clip.intensity);
  const bandFraction = fixed(mix(0.06, 0.1, strength));
  const brightness = fixed(mix(0.018, 0.055, strength));
  const spacing = Math.max(3, Math.round(mix(7, 4, strength)));
  const lineSpeed = Math.max(12, Math.round(mix(28, 72, strength)));
  const lineOpacity = fixed(mix(0.035, 0.12, strength));
  const bandTop = `mod(T*(H+H*${bandFraction})/2.5,H+H*${bandFraction})-H*${bandFraction}`;
  const recipe = opticalFfmpegRecipe({ intensity: clip.intensity, duration: clip.duration, fps });
  filterParts.push(
    `[${inputLabel}]format=rgba,split=4`
    + `[${stageId}-clean-rgba][${stageId}-base-rgba]`
    + `[${stageId}-band-rgba][${stageId}-mask-rgba]`,
  );
  filterParts.push(`[${stageId}-clean-rgba]format=yuv444p[${stageId}-clean]`);
  filterParts.push(`[${stageId}-base-rgba]format=yuv444p[${stageId}-base]`);
  filterParts.push(
    `[${stageId}-band-rgba]rgbashift=rh=1:bh=-1:edge=smear,`
    + `crop=iw-2:ih:x='1+sin(2*PI*t*7)',scale=iw+2:ih,`
    + `eq=brightness=${brightness},format=yuv444p[${stageId}-band]`,
  );
  filterParts.push(
    `[${stageId}-mask-rgba]format=yuv444p,`
    + `geq=lum='if(between(Y\\,${bandTop}\\,${bandTop}+H*${bandFraction})\\,255\\,0)':cb=128:cr=128`
    + `[${stageId}-mask]`,
  );
  filterParts.push(
    `[${stageId}-base][${stageId}-band][${stageId}-mask]maskedmerge,`
    + `drawgrid=w=iw:h=${spacing}:y='mod(t*${lineSpeed},${spacing})':`
    + `t=1:c=black@${lineOpacity}[${stageId}-crt]`,
  );
  filterParts.push(
    `[${stageId}-clean][${stageId}-crt]blend=all_expr='${recipe.blend}'[${outputLabel}]`,
  );
}

function appendMotionEchoStage(options: {
  filterParts: string[];
  inputLabel: string;
  outputLabel: string;
  stageId: string;
  clip: ReelClip;
  fps: number;
}) {
  const { filterParts, inputLabel, outputLabel, stageId, clip, fps } = options;
  const decay = fixed(mix(0.86, 0.96, effectStrength(clip.intensity)));
  const recipe = opticalFfmpegRecipe({ intensity: clip.intensity, duration: clip.duration, fps });
  filterParts.push(
    `[${inputLabel}]format=gbrp,split=2[${stageId}-clean][${stageId}-echo-source]`,
  );
  filterParts.push(`[${stageId}-echo-source]lagfun=decay=${decay}[${stageId}-trail]`);
  filterParts.push(
    `[${stageId}-clean][${stageId}-trail]blend=all_expr='${recipe.blend}',`
    + `format=yuv444p[${outputLabel}]`,
  );
}

function appendVisualEffectStage(options: {
  filterParts: string[];
  inputLabel: string;
  outputLabel: string;
  stageId: string;
  clip: ReelClip;
  effect: ReelVisualEffect;
  fps: number;
}) {
  const { filterParts, inputLabel, outputLabel, stageId, clip, effect, fps } = options;
  if (effect === 'crt-scan') {
    appendCrtScanStage({ filterParts, inputLabel, outputLabel, stageId, clip, fps });
    return;
  }
  if (effect === 'motion-echo') {
    appendMotionEchoStage({ filterParts, inputLabel, outputLabel, stageId, clip, fps });
    return;
  }
  filterParts.push(`[${inputLabel}]null[${outputLabel}]`);
}

function motionFilters(motion: ReelMotion, width: number, height: number, duration: number, fps: number) {
  const frames = Math.max(1, Math.round(duration * fps));
  const progressFrames = Math.max(1, frames - 1);
  const workWidth = Math.ceil(width * MOTION_OVERSCAN / 2) * 2;
  const workHeight = Math.ceil(height * MOTION_OVERSCAN / 2) * 2;
  const singleFrame = 'trim=end_frame=1,setpts=PTS-STARTPTS';
  if (motion === 'still') {
    return `${singleFrame},scale=${width}:${height}:force_original_aspect_ratio=increase,`
      + `crop=${width}:${height},setsar=1,tpad=stop_mode=clone:stop_duration=${fixed(duration)},fps=${fps}`;
  }
  const base = `${singleFrame},scale=${workWidth}:${workHeight}:force_original_aspect_ratio=increase,`
    + `crop=${workWidth}:${workHeight},setsar=1`;

  const expression = cameraFfmpegExpressions(motion, progressFrames);
  const x = `trunc((iw-iw/zoom)*(${expression.focusX}))`;
  const y = `trunc((ih-ih/zoom)*(${expression.focusY}))`;
  return `${base},zoompan=z='${expression.zoom}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=${fps}`;
}

/**
 * Apply the shared camera move after a structural sequence has been sampled
 * to the output frame rate, keeping one decoded effect stream in memory.
 */
function postCompositeMotionFilters(
  motion: ReelMotion,
  width: number,
  height: number,
  duration: number,
  fps: number,
) {
  if (motion === 'still') {
    return `scale=${width}:${height}:flags=lanczos,setsar=1,trim=duration=${duration},`
      + `settb=AVTB,setpts=PTS-STARTPTS,fps=${fps}`;
  }
  const frames = Math.max(1, Math.round(duration * fps));
  const progressFrames = Math.max(1, frames - 1);
  const expression = cameraFfmpegExpressions(motion, progressFrames);
  const x = `trunc((iw-iw/zoom)*(${expression.focusX}))`;
  const y = `trunc((ih-ih/zoom)*(${expression.focusY}))`;
  return `zoompan=z='${expression.zoom}':x='${x}':y='${y}':`
    + `d=1:s=${width}x${height}:fps=${fps},trim=duration=${duration},`
    + `settb=AVTB,setpts=PTS-STARTPTS`;
}

function xfadeName(transition: ReelTransition) {
  const names: Record<Exclude<ReelTransition, 'cut'>, string> = {
    crossfade: 'fade',
    'dip-black': 'fadeblack',
    'slide-left': 'slideleft',
    'slide-right': 'slideright',
    zoom: 'circleopen',
    'soft-dissolve': 'dissolve',
  };
  return transition === 'cut' ? 'fade' : names[transition];
}

export function buildFfmpegCommand(
  project: ReelProject,
  imageNames: string[],
  structuralEffectInputIndexes: StructuralEffectInputIndexes,
  captionInputIndexes: Array<number | null>,
  audioInputIndex: number | null,
): FfmpegCommandPlan {
  const { width, height } = reelDimensions(project.aspectRatio, project.quality);
  const filterParts: string[] = [];
  const args: string[] = [];

  project.clips.forEach((clip, index) => {
    args.push('-i', imageNames[index]);
  });
  structuralEffectInputIndexes.forEach((inputIndex, clipIndex) => {
    if (inputIndex === null) return;
    args.push(
      '-framerate', String(fixed(structuralEffectFps(project.fps))),
      '-start_number', '0',
      '-i', `structural-effect-${clipIndex}-%04d.png`,
    );
  });
  captionInputIndexes.forEach((inputIndex, clipIndex) => {
    if (inputIndex === null) return;
    args.push('-loop', '1', '-framerate', String(project.fps), '-t', String(project.clips[clipIndex].duration), '-i', `caption-${clipIndex}.png`);
  });
  if (audioInputIndex !== null) args.push('-stream_loop', '-1', '-i', 'music-input');

  project.clips.forEach((clip, index) => {
    const sourceLabel = `clip-source-${index}`;
    const baseLabel = `clip-base-${index}`;
    const clipLabel = `clip-${index}`;
    const grades = reelGradeStack(clip).map((effect) => gradeFilters(effect, clip.intensity)).join(',');
    const visualEffects = reelVisualEffectStack(clip);
    const structuralEffects = structuralEffectIds(visualEffects);
    const structuralEffectInputIndex = structuralEffectInputIndexes[index];
    if (structuralEffects.length > 0) {
      if (structuralEffectInputIndex === null) {
        throw new Error(`Missing structural-effect frame sequence for “${clip.title}”.`);
      }
      filterParts.push(
        `[${structuralEffectInputIndex}:v]fps=${project.fps},`
        + `${postCompositeMotionFilters(clip.motion, width, height, clip.duration, project.fps)},`
        + `format=yuv444p[${sourceLabel}]`,
      );
    } else {
      filterParts.push(
        `[${index}:v]${motionFilters(clip.motion, width, height, clip.duration, project.fps)},`
        + `trim=duration=${clip.duration},settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p[${sourceLabel}]`,
      );
    }
    let activeEffectLabel = sourceLabel;
    visualEffects.filter((effect) => !isStructuralEffect(effect)).forEach((effect, effectIndex) => {
      const nextLabel = `clip-effect-${index}-${effectIndex}`;
      appendVisualEffectStage({
        filterParts,
        inputLabel: activeEffectLabel,
        outputLabel: nextLabel,
        stageId: `${effect}-${index}-${effectIndex}`,
        clip,
        effect,
        fps: project.fps,
      });
      activeEffectLabel = nextLabel;
    });
    // Grade the single motion-composited stream once.
    filterParts.push(`[${activeEffectLabel}]${grades || 'null'},format=yuv420p[${baseLabel}]`);
    const captionIndex = captionInputIndexes[index];
    if (captionIndex === null) {
      filterParts.push(`[${baseLabel}]null[${clipLabel}]`);
    } else {
      filterParts.push(`[${captionIndex}:v]format=rgba[caption-${index}-rgba]`);
      filterParts.push(`[${baseLabel}][caption-${index}-rgba]overlay=0:0:shortest=1[${clipLabel}]`);
    }
  });

  let activeLabel = 'clip-0';
  const timeline = compileReelTimeline(project);
  for (let index = 1; index < project.clips.length; index += 1) {
    const clip = project.clips[index];
    const timelineClip = timeline.clips[index];
    const nextLabel = `chain-${index}`;
    if (timelineClip.incomingOverlap <= 0) {
      filterParts.push(`[${activeLabel}][clip-${index}]concat=n=2:v=1:a=0[${nextLabel}]`);
    } else {
      filterParts.push(
        `[${activeLabel}][clip-${index}]xfade=transition=${xfadeName(clip.transition)}:`
        + `duration=${fixed(timelineClip.incomingOverlap)}:offset=${fixed(timelineClip.start)}[${nextLabel}]`,
      );
    }
    activeLabel = nextLabel;
  }
  filterParts.push(`[${activeLabel}]format=yuv420p[video-out]`);

  const outputName = 'director-open-reel.mp4';
  const crf = project.quality === 'maximum' ? '12' : project.quality === 'high' ? '16' : project.quality === 'balanced' ? '19' : '24';
  const preserveTexture = project.clips.some((clip) =>
    reelVisualEffectStack(clip).some((effect) => TEXTURE_CRITICAL_EFFECTS.has(effect)),
  );
  args.push('-filter_complex', filterParts.join(';'), '-map', '[video-out]');
  if (audioInputIndex !== null) {
    args.push('-map', `${audioInputIndex}:a:0`, '-c:a', 'aac', '-b:a', project.quality === 'draft' ? '128k' : '192k', '-shortest');
  }
  args.push(
    '-t', String(fixed(timeline.totalDuration)),
    '-r', String(project.fps),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    ...(preserveTexture ? ['-tune', 'grain'] : []),
    '-crf', crf,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-metadata', 'comment=Rendered locally with Director Open',
    outputName,
  );
  return { args, filterGraph: filterParts.join(';'), outputName, duration: timeline.totalDuration };
}

async function readResponseWithLimit(response: Response, limit: number) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > limit) throw new Error('The remote image exceeds the 64 MB per-image safety limit.');
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limit) throw new Error('The remote image exceeds the 64 MB per-image safety limit.');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error('The remote image exceeds the 64 MB per-image safety limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readClipBytes(clip: ReelClip, signal: AbortSignal) {
  if (clip.sourceFile) {
    const bytes = new Uint8Array(await clip.sourceFile.arrayBuffer());
    if (signal.aborted) throw new Error('Render cancelled.');
    const extension = imageExtension(clip.sourceFile, clip.imageUrl);
    if (!extension) throw new Error(`“${clip.title}” must be a JPEG, PNG, or WebP still image.`);
    return { bytes, extension };
  }
  let response: Response;
  try {
    response = await fetch(clip.imageUrl, { credentials: 'omit', mode: 'cors', signal });
  } catch {
    if (signal.aborted) throw new Error('Render cancelled.');
    throw new Error(`“${clip.title}” could not be read. The image host must allow browser access (CORS).`);
  }
  if (!response.ok) throw new Error(`“${clip.title}” could not be read (HTTP ${response.status}).`);
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].toLowerCase() || '';
  const extension = imageExtensionFromMimeType(contentType) || imageExtension(undefined, clip.imageUrl);
  if (!extension) {
    throw new Error(`“${clip.title}” uses an unsupported image type (${contentType}).`);
  }
  return { bytes: await readResponseWithLimit(response, MAX_IMAGE_BYTES), extension };
}

async function makeCaptionOverlay(clip: ReelClip, width: number, height: number) {
  if (!clip.caption.trim()) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  drawReelCaption(context, clip.caption, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

export function isValidMp4(bytes: Uint8Array) {
  return bytes.byteLength >= 32
    && bytes[4] === 0x66
    && bytes[5] === 0x74
    && bytes[6] === 0x79
    && bytes[7] === 0x70;
}

export class BrowserFfmpegRenderer {
  private ffmpeg: FFmpeg | null = null;
  private cancelled = false;
  private lastLog = '';
  private coreBlobUrls: string[] = [];
  private abortController: AbortController | null = null;

  private revokeCoreBlobUrls() {
    for (const url of this.coreBlobUrls.splice(0)) URL.revokeObjectURL(url);
  }

  cancel() {
    this.cancelled = true;
    this.abortController?.abort();
    this.abortController = null;
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.revokeCoreBlobUrls();
  }

  private async downloadCoreAsset(
    url: string,
    mimeType: string,
    label: string,
    signal: AbortSignal,
    callbacks: RenderCallbacks,
  ) {
    const response = await fetch(url, { credentials: 'omit', mode: 'cors', signal });
    if (!response.ok) throw new Error(`The local render engine could not download ${label} (HTTP ${response.status}).`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_CORE_ASSET_BYTES) throw new Error(`The local render engine returned an oversized ${label} file.`);
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_CORE_ASSET_BYTES) {
            await reader.cancel();
            throw new Error(`The local render engine returned an oversized ${label} file.`);
          }
          chunks.push(value);
          const progress = declared > 0 ? ` · ${Math.min(100, Math.round(total / declared * 100))}%` : '';
          callbacks.onStage('loading', `Downloading ${label}${progress}…`);
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_CORE_ASSET_BYTES) throw new Error(`The local render engine returned an oversized ${label} file.`);
      chunks.push(bytes);
      total = bytes.byteLength;
    }
    if (signal.aborted || this.cancelled) throw new Error('Render cancelled.');
    const blobParts = chunks.map((chunk) => (
      chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer
    ));
    const blobUrl = URL.createObjectURL(new Blob(blobParts, { type: mimeType }));
    this.coreBlobUrls.push(blobUrl);
    return blobUrl;
  }

  private async load(callbacks: RenderCallbacks, signal: AbortSignal) {
    callbacks.onStage('loading', 'Loading the local FFmpeg engine…');
    let ffmpeg: FFmpeg | null = null;
    let log: ((event: { message: string }) => void) | null = null;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      this.ffmpeg?.terminate();
      this.ffmpeg = null;
      this.abortController?.abort();
      this.revokeCoreBlobUrls();
    }, CORE_LOAD_TIMEOUT_MS);
    const aborted = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error(timedOut
        ? 'The local render engine did not finish loading within 90 seconds. Check the connection and retry.'
        : 'Render cancelled.')), { once: true });
    });
    const run = async () => {
      const { FFmpeg: FFmpegClass } = await import('@ffmpeg/ffmpeg');
      if (signal.aborted || this.cancelled) throw new Error(timedOut
        ? 'The local render engine did not finish loading within 90 seconds. Check the connection and retry.'
        : 'Render cancelled.');
      ffmpeg = new FFmpegClass();
      log = ({ message }: { message: string }) => {
        this.lastLog = message.trim().slice(-240);
        callbacks.onLog?.(this.lastLog);
      };
      ffmpeg.on('log', log);
      this.ffmpeg = ffmpeg;
      // The ffmpeg.wasm multi-thread core can deadlock after stream setup in some
      // Chromium/Web Worker combinations. Director defaults to the stable core
      // until upstream multi-thread execution is reliable across supported hosts.
      const useMultiThread = false;
      const corePackage = useMultiThread ? '@ffmpeg/core-mt' : '@ffmpeg/core';
      const baseURL = `${CDN_ROOT}/${corePackage}@${CORE_VERSION}/dist/esm`;
      const loadConfig: { coreURL: string; wasmURL: string; workerURL?: string } = {
        coreURL: await this.downloadCoreAsset(
          `${baseURL}/ffmpeg-core.js`,
          'text/javascript',
          'engine code',
          signal,
          callbacks,
        ),
        wasmURL: await this.downloadCoreAsset(
          `${baseURL}/ffmpeg-core.wasm`,
          'application/wasm',
          'render engine',
          signal,
          callbacks,
        ),
      };
      if (useMultiThread) {
        loadConfig.workerURL = await this.downloadCoreAsset(
          `${baseURL}/ffmpeg-core.worker.js`,
          'text/javascript',
          'engine worker',
          signal,
          callbacks,
        );
      }
      await ffmpeg.load(loadConfig);
      if (signal.aborted || this.cancelled) throw new Error(timedOut
        ? 'The local render engine did not finish loading within 90 seconds. Check the connection and retry.'
        : 'Render cancelled.');
      return { ffmpeg, useMultiThread, log };
    };
    try {
      return await Promise.race([run(), aborted]);
    } catch (error) {
      const activeFfmpeg = this.ffmpeg;
      const activeLog = log as ((event: { message: string }) => void) | null;
      if (activeFfmpeg && activeLog) activeFfmpeg.off('log', activeLog);
      if (activeFfmpeg) {
        activeFfmpeg.terminate();
        this.ffmpeg = null;
      }
      this.revokeCoreBlobUrls();
      if (signal.aborted) {
        throw new Error(timedOut
          ? 'The local render engine did not finish loading within 90 seconds. Check the connection and retry.'
          : 'Render cancelled.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async render(project: ReelProject, callbacks: RenderCallbacks) {
    if (project.clips.length === 0) throw new Error('Add at least one image before rendering.');
    if (reelDuration(project) > 90) throw new Error('Local renders are limited to 90 seconds in Director v2. Shorten the timeline and try again.');
    assertKnownMediaLimits(project);
    this.cancelled = false;
    this.lastLog = '';
    const abortController = new AbortController();
    this.abortController = abortController;
    const { ffmpeg, useMultiThread, log } = await this.load(callbacks, abortController.signal);
    const { width, height } = reelDimensions(project.aspectRatio, project.quality);
    callbacks.onStage('preparing', `Preparing ${project.clips.length} local media file${project.clips.length === 1 ? '' : 's'}…`);

    const writtenInputs: string[] = [];
    const imageNames: string[] = [];
    const clipInputs: Array<{ bytes: Uint8Array; extension: string }> = [];
    let totalInputBytes = 0;
    let progress: ((event: { progress: number }) => void) | null = null;
    let plan: FfmpegCommandPlan | null = null;
    const writeInput = async (name: string, data: Uint8Array, countAsSourceMedia = true) => {
      if (countAsSourceMedia) {
        totalInputBytes += data.byteLength;
        if (totalInputBytes > MAX_AGGREGATE_INPUT_BYTES) {
          throw new Error('The reel exceeds Director’s 256 MB aggregate input limit. Remove or compress media and try again.');
        }
      }
      // ffmpeg.wasm may transfer (and therefore detach) the supplied buffer.
      // Keep caller-owned media readable for derived assets such as the
      // high-resolution true pixel-sort plate.
      await ffmpeg.writeFile(name, data.slice());
      writtenInputs.push(name);
    };
    try {
      for (const [index, clip] of project.clips.entries()) {
        if (this.cancelled) throw new Error('Render cancelled.');
        const input = await readClipBytes(clip, abortController.signal);
        const name = `image-${index}.${input.extension}`;
        await writeInput(name, input.bytes);
        imageNames.push(name);
        clipInputs.push(input);
      }

      const structuralEffectInputIndexes: Array<number | null> = Array(project.clips.length).fill(null);
      let nextInputIndex = project.clips.length;
      const structuralEffectClipCount = project.clips.filter((clip) =>
        reelVisualEffectStack(clip).some(isStructuralEffect),
      ).length;
      let preparedStructuralEffectClips = 0;
      for (const [index, clip] of project.clips.entries()) {
        const effectIds = structuralEffectIds(reelVisualEffectStack(clip));
        if (effectIds.length === 0) continue;
        if (this.cancelled) throw new Error('Render cancelled.');
        preparedStructuralEffectClips += 1;
        const input = clipInputs[index];
        const sequenceInputIndex = nextInputIndex;
        nextInputIndex += 1;
        const timing = await makeStructuralEffectFrameSequence({
          effectIds,
          bytes: input.bytes,
          extension: input.extension,
          width,
          height,
          intensity: clip.intensity,
          seed: effectSeed(`${clip.id}:${effectIds[0]}`),
          effectSeeds: Object.fromEntries(
            effectIds.map((effectId) => [effectId, effectSeed(`${clip.id}:${effectId}`)]),
          ),
          duration: clip.duration,
          outputFps: project.fps,
          signal: abortController.signal,
          shouldCancel: () => this.cancelled,
          yieldEvery: 3,
          onFrame: async ({ bytes, frameIndex, frameCount }) => {
            if (this.cancelled || abortController.signal.aborted) throw new Error('Render cancelled.');
            callbacks.onStage(
              'preparing',
              `Structural effects ${preparedStructuralEffectClips}/${structuralEffectClipCount} · frame ${frameIndex + 1}/${frameCount}…`,
            );
            if (this.cancelled || abortController.signal.aborted) throw new Error('Render cancelled.');
            await writeInput(
              `structural-effect-${index}-${String(frameIndex).padStart(4, '0')}.png`,
              bytes,
              false,
            );
          },
        });
        if (this.cancelled || abortController.signal.aborted) throw new Error('Render cancelled.');
        structuralEffectInputIndexes[index] = sequenceInputIndex;
        callbacks.onLog?.(
          `Structural effects ${preparedStructuralEffectClips}/${structuralEffectClipCount} `
          + `(${effectIds.join(' + ')}): ${timing.frameCount} frames at ${fixed(timing.frameRate)} fps, `
          + `${fixed(timing.averageEffectMs)} ms average, ${fixed(timing.maximumEffectMs)} ms maximum.`,
        );
      }

      const captionInputIndexes: Array<number | null> = Array(project.clips.length).fill(null);
      for (const [index, clip] of project.clips.entries()) {
        if (this.cancelled) throw new Error('Render cancelled.');
        const overlay = await makeCaptionOverlay(clip, width, height);
        if (!overlay) continue;
        const name = `caption-${index}.png`;
        await writeInput(name, overlay);
        captionInputIndexes[index] = nextInputIndex;
        nextInputIndex += 1;
      }

      let audioInputIndex: number | null = null;
      if (project.audio) {
        await writeInput('music-input', new Uint8Array(await project.audio.sourceFile.arrayBuffer()));
        audioInputIndex = nextInputIndex;
      }

      plan = buildFfmpegCommand(
        project,
        imageNames,
        structuralEffectInputIndexes,
        captionInputIndexes,
        audioInputIndex,
      );
      progress = ({ progress: value }: { progress: number }) => callbacks.onProgress(Math.min(0.99, Math.max(0, value)));
      ffmpeg.on('progress', progress);
      callbacks.onStage(
        'rendering',
        `${useMultiThread ? 'Multi-thread' : 'Compatibility'} render · ${width}×${height} · ${project.fps} fps · ${fixed(reelDuration(project))} s`,
      );
      const timeout = renderTimeoutMs(project);
      const exitCode = await ffmpeg.exec(plan.args, timeout);
      if (this.cancelled) throw new Error('Render cancelled.');
      if (exitCode !== 0) {
        throw new Error(`FFmpeg stopped with code ${exitCode}.${this.lastLog ? ` ${this.lastLog}` : ''}`);
      }
      const output = await ffmpeg.readFile(plan.outputName);
      if (!(output instanceof Uint8Array) || !isValidMp4(output)) {
        throw new Error('FFmpeg returned an invalid or incomplete MP4 file. Retry the local render.');
      }
      callbacks.onProgress(1);
      return new Blob([output.slice().buffer], { type: 'video/mp4' });
    } finally {
      if (progress) ffmpeg.off('progress', progress);
      ffmpeg.off('log', log);
      for (const input of writtenInputs) await ffmpeg.deleteFile(input).catch(() => false);
      if (plan) await ffmpeg.deleteFile(plan.outputName).catch(() => false);
      if (this.ffmpeg === ffmpeg) this.cancel();
    }
  }
}
