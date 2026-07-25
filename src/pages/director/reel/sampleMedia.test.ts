import { describe, expect, it, vi, afterEach } from 'vitest';
import { loadSampleFiles, SAMPLE_IMAGES, toFileList } from './sampleMedia';
import { validateLocalImage } from './media';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SAMPLE_IMAGES', () => {
  it('declares unique ids and file names', () => {
    expect(new Set(SAMPLE_IMAGES.map((s) => s.id)).size).toBe(SAMPLE_IMAGES.length);
    expect(new Set(SAMPLE_IMAGES.map((s) => s.fileName)).size).toBe(SAMPLE_IMAGES.length);
  });

  it('uses relative paths so the app works under any deployment prefix', () => {
    for (const sample of SAMPLE_IMAGES) {
      expect(sample.path.startsWith('/')).toBe(false);
      expect(sample.path.startsWith('http')).toBe(false);
    }
  });

  it('describes what each sample is for', () => {
    for (const sample of SAMPLE_IMAGES) {
      expect(sample.title.trim().length).toBeGreaterThan(0);
      expect(sample.note.trim().length).toBeGreaterThan(10);
    }
  });
});

describe('toFileList', () => {
  it('produces a FileList-shaped object the import path can consume', () => {
    const files = [
      new File([new Uint8Array([1, 2])], 'a.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([3, 4])], 'b.jpg', { type: 'image/jpeg' }),
    ];
    const list = toFileList(files);
    expect(list.length).toBe(2);
    expect(list[0].name).toBe('a.jpg');
    expect(list.item(1)?.name).toBe('b.jpg');
    expect(list.item(9)).toBeNull();
    expect(Array.from(list).map((file) => file.name)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('handles an empty set', () => {
    const list = toFileList([]);
    expect(list.length).toBe(0);
    expect(Array.from(list)).toEqual([]);
  });
});

describe('loadSampleFiles', () => {
  it('returns Files the local-image validator accepts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Blob([new Uint8Array(2_048)], { type: 'image/jpeg' }),
      { status: 200 },
    )));
    const files = await loadSampleFiles();
    expect(files).toHaveLength(SAMPLE_IMAGES.length);
    for (const file of files) {
      // Samples must pass the same gate as anything a person imports.
      expect(validateLocalImage(file)).toBeFalsy();
    }
  });

  it('names the sample that failed rather than a bare fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    await expect(loadSampleFiles()).rejects.toThrow(SAMPLE_IMAGES[0].title);
  });

  it('ignores a wrong content type from the host and trusts the file name', async () => {
    // Static hosts sometimes serve images as octet-stream or text/plain. If the
    // File inherited that, the ordinary image validator would reject the sample.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Blob([new Uint8Array(64)], { type: 'application/octet-stream' }),
      { status: 200 },
    )));
    const files = await loadSampleFiles([SAMPLE_IMAGES[0]]);
    expect(files[0].type).toBe('image/jpeg');
    expect(validateLocalImage(files[0])).toBeFalsy();
  });

  it('rejects a sample that is too large for the importer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Blob([new Uint8Array(64)], { type: 'image/jpeg' }),
      { status: 200 },
    )));
    const [file] = await loadSampleFiles([SAMPLE_IMAGES[0]]);
    // Guard the contract rather than the byte count: samples must stay inside
    // whatever limit the importer enforces.
    Object.defineProperty(file, 'size', { value: 1_024 * 1_024 * 1_024 });
    expect(validateLocalImage(file)).toBeTruthy();
  });
});
