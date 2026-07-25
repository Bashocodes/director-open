/**
 * Bundled sample images.
 *
 * A first run otherwise begins with an empty canvas and a file picker, which
 * asks someone to commit their own media before they know whether the tool is
 * any good. These load through exactly the same path as a local import — they
 * become ordinary clips backed by ordinary Files, with no privileged handling
 * and nothing retained once they are removed.
 *
 * Provenance and licence: see public/samples/README.md.
 */

export type SampleImage = {
  id: string;
  fileName: string;
  title: string;
  /** Why this image is in the set — each one exercises a different kind of effect. */
  note: string;
  path: string;
};

export const SAMPLE_IMAGES: readonly SampleImage[] = [
  {
    id: 'temple-panorama',
    fileName: 'temple-panorama.jpg',
    title: 'Temple panorama',
    note: 'Dense architectural detail and real depth — shows tilt shift, halftone and camera moves.',
    path: 'samples/temple-panorama.jpg',
  },
  {
    id: 'graphic-portrait',
    fileName: 'graphic-portrait.jpg',
    title: 'Graphic portrait',
    note: 'Flat colour and bold line — shows grades, light leaks and edge work.',
    path: 'samples/graphic-portrait.jpg',
  },
];

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * The type is derived from the sample's own file name, not from the response.
 * A static host that serves these as `application/octet-stream` or `text/plain`
 * would otherwise produce Files that the ordinary image validator rejects, and
 * the samples would fail for a reason that has nothing to do with the image.
 */
function sampleMimeType(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? 'image/jpeg';
}

/**
 * Fetches the bundled samples as Files. Resolved against the document base so
 * it works under the app's `/director/` base path and any deployment prefix.
 */
export async function loadSampleFiles(
  samples: readonly SampleImage[] = SAMPLE_IMAGES,
): Promise<File[]> {
  const files = await Promise.all(samples.map(async (sample) => {
    const response = await fetch(new URL(sample.path, document.baseURI).toString());
    if (!response.ok) {
      throw new Error(`Director could not load the sample “${sample.title}”.`);
    }
    const blob = await response.blob();
    return new File([blob], sample.fileName, { type: sampleMimeType(sample.fileName) });
  }));
  return files;
}

/** Wraps Files in a FileList-shaped object so samples reuse the local-import path. */
export function toFileList(files: File[]): FileList {
  const list: Record<number, File> & { length: number; item: (index: number) => File | null } = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
  };
  files.forEach((file, index) => { list[index] = file; });
  return list as unknown as FileList;
}
