import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MP4_PARSE_LIMITS,
  parseMp4,
  verifyExport,
  type VerifyExpectations,
} from './index';

function concat(...parts: readonly Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function ascii(value: string) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function be16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, false);
  return bytes;
}

function be32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function box(type: string, ...payload: readonly Uint8Array[]) {
  const body = concat(...payload);
  return concat(be32(body.byteLength + 8), ascii(type), body);
}

function fullBox(
  type: string,
  version: number,
  ...payload: readonly Uint8Array[]
) {
  return box(type, Uint8Array.of(version, 0, 0, 0), ...payload);
}

function identityMatrix() {
  return concat(
    be32(0x0001_0000), be32(0), be32(0),
    be32(0), be32(0x0001_0000), be32(0),
    be32(0), be32(0), be32(0x4000_0000),
  );
}

function movieHeader(timescale: number, duration: number) {
  return fullBox(
    'mvhd',
    0,
    be32(0),
    be32(0),
    be32(timescale),
    be32(duration),
    be32(0x0001_0000),
    be16(0x0100),
    be16(0),
    new Uint8Array(8),
    identityMatrix(),
    new Uint8Array(24),
    be32(3),
  );
}

function mediaHeader(timescale: number, duration: number) {
  return fullBox(
    'mdhd',
    0,
    be32(0),
    be32(0),
    be32(timescale),
    be32(duration),
    be16(0x55c4),
    be16(0),
  );
}

function handler(type: 'vide' | 'soun') {
  return fullBox('hdlr', 0, be32(0), ascii(type), new Uint8Array(12), Uint8Array.of(0));
}

function trackHeader(
  width: number,
  height: number,
  trackId: number,
  duration: number,
  audio: boolean,
) {
  const payload = new Uint8Array(84);
  const view = new DataView(payload.buffer);
  payload.set([0, 0, 0, 7], 0);
  view.setUint32(12, trackId, false);
  view.setUint32(20, duration, false);
  view.setUint16(36, audio ? 0x0100 : 0, false);
  payload.set(identityMatrix(), 40);
  view.setUint32(76, width * 65_536, false);
  view.setUint32(80, height * 65_536, false);
  return box('tkhd', payload);
}

function timingTables(sampleCount: number, sampleDelta: number) {
  return [
    fullBox('stts', 0, be32(1), be32(sampleCount), be32(sampleDelta)),
    fullBox('stsz', 0, be32(100), be32(sampleCount)),
  ] as const;
}

function videoSampleEntry(
  width: number,
  height: number,
  codec: 'avc1' | 'hvc1' = 'avc1',
  withConfig = true,
) {
  const fields = new Uint8Array(78);
  const view = new DataView(fields.buffer);
  view.setUint16(6, 1, false);
  view.setUint16(24, width, false);
  view.setUint16(26, height, false);
  view.setUint32(28, 0x0048_0000, false);
  view.setUint32(32, 0x0048_0000, false);
  view.setUint16(40, 1, false);
  view.setUint16(74, 0x0018, false);
  view.setUint16(76, 0xffff, false);
  return box(
    codec,
    fields,
    ...(withConfig
      ? [box(codec === 'avc1' ? 'avcC' : 'hvcC', Uint8Array.of(1, 100, 0, 40))]
      : []),
  );
}

function audioSampleEntry(sampleRate: number) {
  const fields = new Uint8Array(28);
  const view = new DataView(fields.buffer);
  view.setUint16(6, 1, false);
  view.setUint16(16, 2, false);
  view.setUint16(18, 16, false);
  view.setUint32(24, sampleRate * 65_536, false);
  return box('mp4a', fields, box('esds', Uint8Array.of(0, 0, 0, 0)));
}

function sampleTable(
  entry: Uint8Array,
  sampleCount: number,
  sampleDelta: number,
) {
  const [stts, stsz] = timingTables(sampleCount, sampleDelta);
  return box(
    'stbl',
    fullBox('stsd', 0, be32(1), entry),
    stts,
    stsz,
  );
}

function track(options: {
  type: 'vide' | 'soun';
  timescale: number;
  duration: number;
  sampleCount: number;
  sampleDelta: number;
  width?: number;
  height?: number;
  sampleRate?: number;
  videoCodec?: 'avc1' | 'hvc1';
}) {
  const width = options.width ?? 0;
  const height = options.height ?? 0;
  const entry = options.type === 'vide'
    ? videoSampleEntry(width, height, options.videoCodec)
    : audioSampleEntry(options.sampleRate ?? 48_000);
  return box(
    'trak',
    trackHeader(
      width,
      height,
      options.type === 'vide' ? 1 : 2,
      Math.round(options.duration / options.timescale * 1_000),
      options.type === 'soun',
    ),
    box(
      'mdia',
      mediaHeader(options.timescale, options.duration),
      handler(options.type),
      box('minf', sampleTable(entry, options.sampleCount, options.sampleDelta)),
    ),
  );
}

function fileType() {
  return box(
    'ftyp',
    ascii('isom'),
    be32(0x200),
    ascii('isom'),
    ascii('iso2'),
    ascii('avc1'),
    ascii('mp41'),
  );
}

function validFixture(videoCodec: 'avc1' | 'hvc1' = 'avc1') {
  const durationSeconds = 9.87;
  return concat(
    fileType(),
    box(
      'moov',
      movieHeader(1_000, 9_870),
      track({
        type: 'vide',
        timescale: 90_000,
        duration: 888_300,
        sampleCount: 296,
        sampleDelta: 3_000,
        width: 1_080,
        height: 1_920,
        videoCodec,
      }),
      track({
        type: 'soun',
        timescale: 48_000,
        duration: 473_760,
        sampleCount: 480,
        sampleDelta: 987,
        sampleRate: 48_000,
      }),
    ),
    box('mdat', new Uint8Array(2_048)),
  );
}

const EXPECTATIONS: VerifyExpectations = {
  durationSeconds: 10,
  durationToleranceSeconds: 0.25,
  width: 1_080,
  height: 1_920,
  fps: 30,
  expectAudio: true,
};

describe('bounded ISO-BMFF parser', () => {
  it('extracts brands, timing, tracks, codecs, dimensions, frames, and audio rate', () => {
    const parsed = parseMp4(validFixture());
    const video = parsed.tracks.find((item) => item.type === 'video');
    const audio = parsed.tracks.find((item) => item.type === 'audio');

    expect(parsed.issues).toEqual([]);
    expect(parsed.brands?.value).toEqual(['isom', 'iso2', 'avc1', 'mp41']);
    expect(parsed.movieTimescale?.value).toBe(1_000);
    expect(parsed.movieDuration).toMatchObject({
      units: 9_870,
      timescale: 1_000,
      seconds: 9.87,
    });
    expect(parsed.trackCount).toBe(2);
    expect(parsed.tracks.map((item) => item.type)).toEqual(['video', 'audio']);
    expect(video).toMatchObject({
      codec: { value: 'avc1' },
      requiredConfigBox: 'avcC',
      configBoxPresent: { value: true },
      dimensions: { value: { width: 1_080, height: 1_920 } },
      mediaTimescale: { value: 90_000 },
      sttsFrameCount: { value: 296 },
      stszFrameCount: { value: 296 },
      frameCount: { value: 296 },
    });
    expect(audio).toMatchObject({
      codec: { value: 'mp4a' },
      mediaTimescale: { value: 48_000 },
      sampleRate: { value: 48_000 },
    });
    expect(parsed.hasMdat).toBe(true);
    expect(parsed.mdatPayloadBytes).toBe(2_048);
  });

  it('builds a precise all-client-side verification report', () => {
    const report = verifyExport(validFixture(), EXPECTATIONS);

    expect(report.verdict).toBe('ok');
    expect(report.entries.find((item) => item.field === 'duration')).toMatchObject({
      value: 9.87,
      sourceBox: expect.stringContaining('mvhd'),
      status: 'ok',
      message: 'Duration 9.87s, expected 10.00s ± 0.25s — ok.',
    });
    expect(report.entries.find((item) => item.field === 'resolution')).toMatchObject({
      value: '1080×1920',
      status: 'ok',
    });
    expect(report.entries.find((item) => item.field === 'video-codec')).toMatchObject({
      value: 'avc1',
      status: 'ok',
    });
    expect(report.entries.find((item) => item.field === 'audio-sample-rate')).toMatchObject({
      value: 48_000,
      status: 'ok',
    });
  });

  it('extracts HEVC configuration and reports the project codec mismatch as a note', () => {
    const parsed = parseMp4(validFixture('hvc1'));
    const report = verifyExport(validFixture('hvc1'), EXPECTATIONS);

    expect(parsed.tracks[0]).toMatchObject({
      codec: { value: 'hvc1' },
      requiredConfigBox: 'hvcC',
      configBoxPresent: { value: true },
    });
    expect(report.verdict).toBe('warn');
    expect(report.entries.find((item) => item.field === 'video-codec')).toMatchObject({
      value: 'hvc1',
      status: 'warn',
      message: expect.stringContaining('renderer requests H.264'),
    });
  });

  it('never throws for truncated, absurd-size, deeply nested, or zero-track files', () => {
    const truncated = concat(be32(24), ascii('ftyp'), ascii('isom'));
    const absurdSize = concat(be32(0xffff_ffff), ascii('mdat'));
    let deeplyNested = box('free');
    for (let index = 0; index < DEFAULT_MP4_PARSE_LIMITS.maxDepth + 2; index += 1) {
      deeplyNested = box('moov', deeplyNested);
    }
    const zeroTrack = concat(
      fileType(),
      box('moov', movieHeader(1_000, 10_000)),
      box('mdat', new Uint8Array(2_048)),
    );

    for (const fixture of [truncated, absurdSize, deeplyNested, zeroTrack]) {
      expect(() => parseMp4(fixture)).not.toThrow();
      expect(() => verifyExport(fixture, EXPECTATIONS)).not.toThrow();
      expect(verifyExport(fixture, EXPECTATIONS).verdict).toBe('fail');
    }
    expect(parseMp4(truncated).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'truncated-box' }),
    ]));
    expect(parseMp4(absurdSize).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'truncated-box' }),
    ]));
    expect(parseMp4(deeplyNested).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'depth-limit' }),
    ]));
    expect(parseMp4(zeroTrack).trackCount).toBe(0);
  });

  it('enforces the box-count bound without throwing or looping', () => {
    const manyBoxes = concat(
      box('free'),
      box('free'),
      box('free'),
      box('free'),
    );
    const parsed = parseMp4(manyBoxes, { maxBoxes: 3 });

    expect(parsed.boxCount).toBe(3);
    expect(parsed.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'box-limit' }),
    ]));
  });

  it('keeps safety limits finite and treats an all-ones v0 duration as unknown', () => {
    const boxTotal = DEFAULT_MP4_PARSE_LIMITS.maxBoxes + 1;
    const manyBoxes = new Uint8Array(boxTotal * 8);
    const view = new DataView(manyBoxes.buffer);
    for (let index = 0; index < boxTotal; index += 1) {
      const offset = index * 8;
      view.setUint32(offset, 8, false);
      manyBoxes.set(ascii('free'), offset + 4);
    }
    const bounded = parseMp4(manyBoxes, { maxBoxes: Number.POSITIVE_INFINITY });
    const unknownDuration = parseMp4(concat(
      fileType(),
      box('moov', movieHeader(1_000, 0xffff_ffff)),
    ));

    expect(bounded.boxCount).toBe(DEFAULT_MP4_PARSE_LIMITS.maxBoxes);
    expect(bounded.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'box-limit' }),
    ]));
    expect(unknownDuration.movieDuration).toBeNull();
    expect(unknownDuration.movieTimescale?.value).toBe(1_000);
    expect(unknownDuration.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unknown-mvhd-duration', status: 'warn' }),
    ]));
  });

  it('does not allocate from an absent extended-size declaration', () => {
    const nearMaximumSafeSize = concat(
      be32(1),
      ascii('mdat'),
      be32(0x1f_ffff),
      be32(0xffff_ffff),
    );
    const parsed = parseMp4(nearMaximumSafeSize);
    const report = verifyExport(nearMaximumSafeSize, EXPECTATIONS);

    expect(parsed.boxCount).toBe(1);
    expect(parsed.tracks).toEqual([]);
    expect(parsed.issues.length).toBeLessThanOrEqual(DEFAULT_MP4_PARSE_LIMITS.maxIssues);
    expect(parsed.issues[0]).toMatchObject({ code: 'truncated-box' });
    expect(JSON.stringify({ parsed, report }).length).toBeLessThan(8_000);
  });
});
