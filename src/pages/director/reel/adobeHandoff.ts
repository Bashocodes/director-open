import {
  buildDirectorAdobeRenderPlan,
  type DirectorAdobeRenderPlan,
} from '../../../shared/directorAdobeRenderPlan';
import type { ReelProject } from './types';

export type AdobeDirectoryFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob | string) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

export type AdobeDirectoryHandle = {
  getDirectoryHandle: (name: string, options: { create: true }) => Promise<AdobeDirectoryHandle>;
  getFileHandle: (name: string, options: { create: true }) => Promise<AdobeDirectoryFileHandle>;
};

export type DirectorAdobeHandoff = {
  plan: DirectorAdobeRenderPlan;
  planName: string;
  planJson: string;
  media: Array<{
    relativePath: string;
    data: Blob;
  }>;
  totalBytes: number;
};

export type DirectorPreparedClipPlate = {
  clipId: string;
  data: Blob;
};

export type DirectorLocalAdobeResponse = {
  ok: true;
  packagePath: string | null;
  planPath: string | null;
  outputPath: string;
  outputBytes?: number;
  configPath: string | null;
  adobe:
    | { status: 'rendered'; receipt: Record<string, unknown> }
    | { status: 'queued'; receipt: Record<string, unknown>; warning: string }
    | { status: 'not-configured'; error: string }
    | { status: 'failed'; error: string };
};

export class DirectorLocalAdobeUnavailableError extends Error {
  constructor() {
    super('Director’s local Adobe service is not available.');
    this.name = 'DirectorLocalAdobeUnavailableError';
  }
}

export function adobeHandoffName(title: string) {
  const stem = title
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'director-reel';
  return `${stem}.director-adobe.json`;
}

export function adobeHandoffArchiveName(title: string) {
  return adobeHandoffName(title).replace(/\.json$/, '.zip');
}

function generatedImageBlob(url: string) {
  const match = url.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const binary = atob(match[2].replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

function mediaBlob(project: ReelProject, mediaId: string) {
  if (mediaId === 'director-audio') return project.audio?.sourceFile ?? null;
  const clip = project.clips.find((item) => `clip-media-${item.id}` === mediaId);
  if (!clip) return null;
  return clip.sourceFile ?? generatedImageBlob(clip.imageUrl);
}

export function buildDirectorAdobeHandoff(
  project: ReelProject,
  preparedClipPlates: readonly DirectorPreparedClipPlate[] = [],
): DirectorAdobeHandoff {
  const plan = buildDirectorAdobeRenderPlan(project);
  const preparedByMediaId = new Map<string, Blob>();
  for (const plate of preparedClipPlates) {
    const clipIndex = plan.timeline.clips.findIndex((clip) => clip.clipId === plate.clipId);
    if (clipIndex < 0) throw new Error(`Director prepared an Adobe plate for an unknown clip: ${plate.clipId}.`);
    const clip = plan.timeline.clips[clipIndex];
    const media = plan.media.find((entry) => entry.id === clip.mediaId);
    if (!media) throw new Error(`Director could not attach the prepared Adobe plate for “${clip.title}”.`);
    const titleStem = clip.title
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `clip-${clipIndex + 1}`;
    media.relativePath = `media/clip-${String(clipIndex + 1).padStart(2, '0')}-${titleStem}-director-effects.mp4`;
    media.originalName = `${titleStem}-director-effects.mp4`;
    media.mimeType = 'video/mp4';
    media.bytes = plate.data.size;
    media.available = plate.data.size > 0;
    clip.preparedVisualEffectStack = [...clip.visualEffectStack];
    clip.preparedMotion = true;
    preparedByMediaId.set(media.id, plate.data);
  }
  const planJson = `${JSON.stringify(plan, null, 2)}\n`;
  const media = plan.media.map((entry) => {
    const data = preparedByMediaId.get(entry.id) ?? mediaBlob(project, entry.id);
    if (!data) throw new Error(`Director could not resolve Adobe handoff media “${entry.originalName}”.`);
    if (data.size !== entry.bytes) {
      throw new Error(`Adobe handoff media changed while packaging: ${entry.originalName}.`);
    }
    return { relativePath: entry.relativePath, data };
  });
  return {
    plan,
    planName: adobeHandoffName(project.title),
    planJson,
    media,
    totalBytes: new Blob([planJson]).size + media.reduce((sum, entry) => sum + entry.data.size, 0),
  };
}

async function writeFile(handle: AdobeDirectoryFileHandle, data: Blob | string) {
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

export async function writeDirectorAdobeHandoff(
  root: AdobeDirectoryHandle,
  handoff: DirectorAdobeHandoff,
) {
  const mediaDirectory = await root.getDirectoryHandle('media', { create: true });
  for (const entry of handoff.media) {
    const name = entry.relativePath.replace(/^media\//, '');
    await writeFile(
      await mediaDirectory.getFileHandle(name, { create: true }),
      entry.data,
    );
  }
  await writeFile(
    await root.getFileHandle(handoff.planName, { create: true }),
    handoff.planJson,
  );
}

async function blobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Director could not read handoff media.'));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Portable fallback for browsers without the File System Access API. Stored
 * media entries avoid wasting CPU recompressing JPEG/PNG/WebP source files.
 */
export async function zipDirectorAdobeHandoff(handoff: DirectorAdobeHandoff) {
  const { strToU8, zip } = await import('fflate');
  const entries: Record<string, Uint8Array> = {
    [handoff.planName]: strToU8(handoff.planJson),
  };
  for (const entry of handoff.media) {
    entries[entry.relativePath] = await blobBytes(entry.data);
  }
  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 0 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
  const archiveBytes = new Uint8Array(archive.byteLength);
  archiveBytes.set(archive);
  return new Blob([archiveBytes.buffer], { type: 'application/zip' });
}

function responseRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Preferred local workflow: the trusted Director development server writes the
 * package to ~/Movies/Director and executes the existing Adobe MCP bridge.
 * Hosted/static builds fall back to a normal browser download.
 */
export async function sendDirectorAdobeHandoffToLocalService(
  handoff: DirectorAdobeHandoff,
  request: typeof fetch = fetch,
): Promise<DirectorLocalAdobeResponse> {
  const archive = await zipDirectorAdobeHandoff(handoff);
  let response: Response;
  try {
    response = await request(
      new URL('api/local-adobe/handoff', document.baseURI),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/zip',
          'x-director-local': '1',
        },
        body: archive,
        credentials: 'same-origin',
      },
    );
  } catch {
    throw new DirectorLocalAdobeUnavailableError();
  }
  if (response.status === 404) throw new DirectorLocalAdobeUnavailableError();
  const payload = responseRecord(await response.json().catch(() => null));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Director could not save the Adobe project locally.',
    );
  }
  if (
    payload?.ok !== true
    || !(typeof payload.packagePath === 'string' || payload.packagePath === null)
    || !(typeof payload.planPath === 'string' || payload.planPath === null)
    || typeof payload.outputPath !== 'string'
    || !responseRecord(payload.adobe)
  ) {
    throw new Error('Director’s local Adobe service returned an invalid receipt.');
  }
  return payload as DirectorLocalAdobeResponse;
}
