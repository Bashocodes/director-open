/**
 * Library data seam.
 *
 * The media drawer talks to a `LibrarySource` rather than reaching into canvas
 * state directly. Today the only implementation is {@link createLocalLibrarySource},
 * which surfaces the browser-local media already held by the active project
 * (uploaded canvas references + the reel audio). A future provider — e.g. an
 * MCP-backed remote library — can implement the same interface without touching
 * the drawer UI. This seam is documented in docs/DECISIONS.md.
 */
import type { ReelProject } from './reel/types';
import type { CanvasObject } from './types';

export type LibraryItemKind = 'image' | 'audio';

export type LibraryItem = {
  /** Stable identity used for removal and React keys. */
  id: string;
  kind: LibraryItemKind;
  title: string;
  /** Object URL for preview (images). Absent for audio. */
  url?: string;
  /** Human-readable size, when known. */
  sizeLabel?: string;
  origin: 'canvas' | 'reel-audio';
};

export interface LibrarySource {
  /** Stable identifier of the backing provider (e.g. 'local'). */
  readonly id: string;
  /** Human label shown in the drawer header. */
  readonly label: string;
  /** Whether this source keeps media on-device only. */
  readonly localOnly: boolean;
  list(): LibraryItem[];
  add(files: File[]): void;
  remove(item: LibraryItem): void;
}

export function formatMediaSize(bytes: number | undefined): string | undefined {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return undefined;
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

const IMAGE_KINDS = new Set(['reference', 'upload', 'created']);

type LocalLibraryDeps = {
  objects: CanvasObject[];
  reelProject: ReelProject | null;
  onAddFiles: (files: File[]) => void;
  onRemoveObject: (id: string) => void;
  onRemoveAudio: () => void;
};

export const REEL_AUDIO_ITEM_ID = 'reel-audio';

/**
 * Local, browser-only library backed by the active project's runtime media.
 * `list()` reflects the snapshot captured at construction time; recompute (e.g.
 * via useMemo) when objects/reel change.
 */
export function createLocalLibrarySource(deps: LocalLibraryDeps): LibrarySource {
  return {
    id: 'local',
    label: 'Local media',
    localOnly: true,
    list() {
      const items: LibraryItem[] = [];
      for (const object of deps.objects) {
        if (!object.sourceFile || !IMAGE_KINDS.has(object.kind)) continue;
        items.push({
          id: object.id,
          kind: 'image',
          title: object.title || object.sourceFile.name || 'Local image',
          url: object.imageUrl,
          sizeLabel: formatMediaSize(object.sourceFile.size),
          origin: 'canvas',
        });
      }
      const audio = deps.reelProject?.audio;
      if (audio) {
        items.push({
          id: REEL_AUDIO_ITEM_ID,
          kind: 'audio',
          title: audio.name || 'Reel audio',
          sizeLabel: formatMediaSize(audio.sourceFile?.size),
          origin: 'reel-audio',
        });
      }
      return items;
    },
    add(files) {
      if (files.length) deps.onAddFiles(files);
    },
    remove(item) {
      if (item.origin === 'reel-audio') deps.onRemoveAudio();
      else deps.onRemoveObject(item.id);
    },
  };
}
