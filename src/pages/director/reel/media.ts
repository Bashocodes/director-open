import { reelGradeStack, reelVisualEffectStack, type ReelProject } from './types';

export const MAX_IMAGE_BYTES = 64 * 1_048_576;
export const MAX_AUDIO_BYTES = 128 * 1_048_576;
export const MAX_AGGREGATE_INPUT_BYTES = 256 * 1_048_576;

const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export function imageExtensionFromMimeType(type: string | null | undefined) {
  return type ? IMAGE_TYPES.get(type.split(';', 1)[0].trim().toLowerCase()) || null : null;
}

export function isGeneratedImageUrl(url: string) {
  return /^data:image\/(?:jpeg|png|webp);base64,/i.test(url);
}

const AUDIO_TYPES = new Set([
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/webm',
  'audio/x-m4a',
  'audio/x-wav',
  'application/ogg',
]);
const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'oga', 'ogg', 'wav', 'webm']);

function extension(name: string) {
  return name.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase() || '';
}

export function imageExtension(file: File | undefined, url: string) {
  if (file?.type) return imageExtensionFromMimeType(file.type);
  const fromName = extension(file?.name || url);
  if (fromName === 'jpeg' || fromName === 'jpg') return 'jpg';
  if (fromName === 'png' || fromName === 'webp') return fromName;
  return null;
}

export function validateLocalImage(file: File) {
  if (!imageExtension(file, file.name)) {
    return 'Use a JPEG, PNG, or WebP still image.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Each image must be 64 MB or smaller.';
  }
  return null;
}

export function validateLocalAudio(file: File) {
  if ((file.type && !AUDIO_TYPES.has(file.type.toLowerCase()))
    || (!file.type && !AUDIO_EXTENSIONS.has(extension(file.name)))) {
    return 'Use an MP3, M4A/AAC, WAV, FLAC, Ogg, or WebM audio file.';
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return 'Music must be 128 MB or smaller.';
  }
  return null;
}

export function assertKnownMediaLimits(project: ReelProject) {
  let knownBytes = 0;
  for (const clip of project.clips) {
    if (!clip.sourceFile) {
      if (isGeneratedImageUrl(clip.imageUrl)) {
        const generatedBytes = Math.ceil(clip.imageUrl.length * 0.75);
        if (generatedBytes > MAX_IMAGE_BYTES) {
          throw new Error(`“${clip.title}” cannot be rendered. Each image must be 64 MB or smaller.`);
        }
        knownBytes += generatedBytes;
        continue;
      }
      throw new Error(`“${clip.title}” is missing its local source file. Add the image again before rendering.`);
    }
    const error = validateLocalImage(clip.sourceFile);
    if (error) throw new Error(`“${clip.title}” cannot be rendered. ${error}`);
    knownBytes += clip.sourceFile.size;
  }
  if (project.audio) {
    const error = validateLocalAudio(project.audio.sourceFile);
    if (error) throw new Error(error);
    knownBytes += project.audio.sourceFile.size;
  }
  if (knownBytes > MAX_AGGREGATE_INPUT_BYTES) {
    throw new Error('The selected local media exceeds Director’s 256 MB aggregate render limit. Remove or compress files and try again.');
  }
}

export function reelProjectFingerprint(project: ReelProject) {
  return JSON.stringify({
    aspectRatio: project.aspectRatio,
    fps: project.fps,
    quality: project.quality,
    clips: project.clips.map((clip) => ({
      id: clip.id,
      objectId: clip.objectId,
      title: clip.title,
      imageUrl: clip.imageUrl,
      file: clip.sourceFile ? [clip.sourceFile.name, clip.sourceFile.size, clip.sourceFile.type, clip.sourceFile.lastModified] : null,
      duration: clip.duration,
      effect: clip.effect,
      gradeStack: reelGradeStack(clip),
      visualEffect: clip.visualEffect || 'none',
      visualEffectStack: reelVisualEffectStack(clip),
      transition: clip.transition,
      transitionDuration: clip.transitionDuration,
      motion: clip.motion,
      intensity: clip.intensity,
      pluginParams: clip.pluginParams || {},
      caption: clip.caption,
    })),
    audio: project.audio ? [
      project.audio.url,
      project.audio.sourceFile.name,
      project.audio.sourceFile.size,
      project.audio.sourceFile.type,
      project.audio.sourceFile.lastModified,
    ] : null,
  });
}

export function revokeProjectObjectUrls(project: ReelProject | null) {
  if (!project) return;
  for (const clip of project.clips) {
    if (clip.sourceFile) URL.revokeObjectURL(clip.imageUrl);
  }
  if (project.audio) URL.revokeObjectURL(project.audio.url);
}

export function revokeRemovedProjectObjectUrls(
  previous: ReelProject | null,
  next: ReelProject | null,
  retainedObjectUrls: ReadonlySet<string> = new Set(),
) {
  if (!previous) return;
  const retainedClipUrls = new Set(next?.clips.filter((clip) => clip.sourceFile).map((clip) => clip.imageUrl) || []);
  for (const clip of previous.clips) {
    if (clip.sourceFile && !retainedClipUrls.has(clip.imageUrl) && !retainedObjectUrls.has(clip.imageUrl)) {
      URL.revokeObjectURL(clip.imageUrl);
    }
  }
  if (previous.audio && previous.audio.url !== next?.audio?.url) URL.revokeObjectURL(previous.audio.url);
}
