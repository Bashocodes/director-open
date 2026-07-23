import type {
  Mp4Dimensions,
  Mp4Duration,
  Mp4ParseIssue,
  Mp4ParseLimits,
  Mp4SourcedValue,
  Mp4TrackType,
  ParsedMp4,
  ParsedMp4Track,
} from './types';

/**
 * A deliberately small ISO-BMFF reader for exported MP4 inspection.
 *
 * The parser never decodes media payloads. It walks bounded box ranges using a
 * single DataView, records only compact metadata, and skips `mdat` in O(1).
 * Malformed input is represented as issues rather than thrown exceptions.
 */

export const DEFAULT_MP4_PARSE_LIMITS: Readonly<Mp4ParseLimits> = {
  maxDepth: 12,
  maxBoxes: 10_000,
  maxIssues: 128,
  maxTracks: 64,
  maxBrands: 64,
};

type Box = {
  start: number;
  end: number;
  payloadStart: number;
  headerSize: number;
  type: string;
  path: string;
};

type MutableTrack = ParsedMp4Track;

const CONTAINERS = new Set(['moov', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex', 'moof', 'traf']);
const VIDEO_SAMPLE_ENTRIES = new Set(['avc1', 'avc3', 'hvc1', 'hev1']);
const AUDIO_SAMPLE_ENTRIES = new Set(['mp4a', 'ac-3', 'ec-3', 'alac', 'Opus']);

function emptyTrack(index: number): MutableTrack {
  return {
    index,
    type: 'unknown',
    handlerType: null,
    mediaTimescale: null,
    duration: null,
    codec: null,
    dimensions: null,
    displayDimensions: null,
    requiredConfigBox: null,
    configBoxPresent: null,
    sttsFrameCount: null,
    stszFrameCount: null,
    frameCount: null,
    sampleRate: null,
  };
}

function handlerTrackType(handler: string): Mp4TrackType {
  if (handler === 'vide') return 'video';
  if (handler === 'soun') return 'audio';
  if (handler === 'hint') return 'hint';
  if (handler === 'meta') return 'metadata';
  if (handler === 'text' || handler === 'sbtl' || handler === 'subt' || handler === 'clcp') {
    return 'subtitle';
  }
  return 'unknown';
}

export function parseMp4(
  bytes: Uint8Array,
  overrides: Partial<Mp4ParseLimits> = {},
): ParsedMp4 {
  const boundedLimit = (value: number | undefined, fallback: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(fallback, Math.max(1, Math.floor(value)));
  };
  const limits: Mp4ParseLimits = {
    maxDepth: boundedLimit(overrides.maxDepth, DEFAULT_MP4_PARSE_LIMITS.maxDepth),
    maxBoxes: boundedLimit(overrides.maxBoxes, DEFAULT_MP4_PARSE_LIMITS.maxBoxes),
    maxIssues: boundedLimit(overrides.maxIssues, DEFAULT_MP4_PARSE_LIMITS.maxIssues),
    maxTracks: boundedLimit(overrides.maxTracks, DEFAULT_MP4_PARSE_LIMITS.maxTracks),
    maxBrands: boundedLimit(overrides.maxBrands, DEFAULT_MP4_PARSE_LIMITS.maxBrands),
  };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const issues: Mp4ParseIssue[] = [];
  const tracks: MutableTrack[] = [];
  let brands: ParsedMp4['brands'] = null;
  let movieTimescale: ParsedMp4['movieTimescale'] = null;
  let movieDuration: Mp4Duration | null = null;
  let hasFtyp = false;
  let hasMdat = false;
  let mdatPayloadBytes = 0;
  let boxCount = 0;
  let maxDepthSeen = 0;
  let stopped = false;

  const issue = (
    status: Mp4ParseIssue['status'],
    code: string,
    offset: number,
    sourceBox: string,
    message: string,
  ) => {
    if (issues.length >= limits.maxIssues) return;
    issues.push({ status, code, offset, sourceBox, message });
  };

  const hasRange = (offset: number, length: number, end = bytes.byteLength) => (
    Number.isSafeInteger(offset)
    && Number.isSafeInteger(length)
    && offset >= 0
    && length >= 0
    && offset <= end
    && length <= end - offset
  );

  const u16 = (offset: number) => view.getUint16(offset, false);
  const u32 = (offset: number) => view.getUint32(offset, false);
  const fourCc = (offset: number) => String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );

  const u64 = (offset: number, box: Box, label: string): number | null => {
    const high = u32(offset);
    const low = u32(offset + 4);
    if (high === 0xffff_ffff && low === 0xffff_ffff) return null;
    if (high > 0x1f_ffff) {
      issue('fail', 'unsafe-integer', offset, box.path, `${label} exceeds JavaScript’s safe integer range.`);
      return null;
    }
    return high * 0x1_0000_0000 + low;
  };

  const nextBox = (start: number, parentEnd: number, parentPath: string): Box | null => {
    const sourceBox = parentPath || 'file';
    if (!hasRange(start, 8, parentEnd)) {
      issue('fail', 'truncated-box-header', start, sourceBox, 'The file ends inside an ISO-BMFF box header.');
      return null;
    }
    if (boxCount >= limits.maxBoxes) {
      issue('fail', 'box-limit', start, sourceBox, `The box-count safety limit (${limits.maxBoxes}) was reached.`);
      stopped = true;
      return null;
    }
    boxCount += 1;
    const size32 = u32(start);
    const type = fourCc(start + 4);
    let size: number;
    let headerSize = 8;
    if (size32 === 1) {
      if (!hasRange(start, 16, parentEnd)) {
        issue('fail', 'truncated-large-size', start, `${sourceBox}/${type}`, 'The extended-size box header is truncated.');
        return null;
      }
      headerSize = 16;
      const high = u32(start + 8);
      const low = u32(start + 12);
      if (high > 0x1f_ffff) {
        issue('fail', 'absurd-box-size', start, `${sourceBox}/${type}`, 'The declared box size exceeds JavaScript’s safe integer range.');
        return null;
      }
      size = high * 0x1_0000_0000 + low;
    } else {
      size = size32 === 0 ? parentEnd - start : size32;
    }
    if (size < headerSize) {
      issue('fail', 'invalid-box-size', start, `${sourceBox}/${type}`, `Box ${type} declares ${size} bytes, smaller than its ${headerSize}-byte header.`);
      return null;
    }
    if (size > parentEnd - start) {
      issue('fail', 'truncated-box', start, `${sourceBox}/${type}`, `Box ${type} declares ${size} bytes, but only ${parentEnd - start} remain.`);
      return null;
    }
    const path = `${sourceBox}/${type}`;
    return { start, end: start + size, payloadStart: start + headerSize, headerSize, type, path };
  };

  const parseDuration = (
    box: Box,
    label: string,
  ): { duration: Mp4Duration | null; timescale: Mp4SourcedValue<number> | null } => {
    if (!hasRange(box.payloadStart, 4, box.end)) {
      issue('fail', `truncated-${box.type}`, box.start, box.path, `${label} full-box header is truncated.`);
      return { duration: null, timescale: null };
    }
    const version = bytes[box.payloadStart];
    const timescaleOffset = box.payloadStart + (version === 1 ? 20 : 12);
    const durationOffset = box.payloadStart + (version === 1 ? 24 : 16);
    const durationBytes = version === 1 ? 8 : 4;
    if (version !== 0 && version !== 1) {
      issue('warn', `unsupported-${box.type}-version`, box.start, box.path, `${label} version ${version} is not supported.`);
      return { duration: null, timescale: null };
    }
    if (!hasRange(timescaleOffset, 4 + durationBytes, box.end)) {
      issue('fail', `truncated-${box.type}`, box.start, box.path, `${label} timing fields are truncated.`);
      return { duration: null, timescale: null };
    }
    const timescale = u32(timescaleOffset);
    const sourcedTimescale = { value: timescale, sourceBox: box.path };
    const units = version === 1
      ? u64(durationOffset, box, `${label} duration`)
      : u32(durationOffset);
    if (timescale === 0) {
      issue('fail', `zero-${box.type}-timescale`, timescaleOffset, box.path, `${label} has a zero timescale.`);
      return { duration: null, timescale: sourcedTimescale };
    }
    if (units === null || (version === 0 && units === 0xffff_ffff)) {
      issue('warn', `unknown-${box.type}-duration`, durationOffset, box.path, `${label} duration is unavailable.`);
      return { duration: null, timescale: sourcedTimescale };
    }
    return {
      duration: { units, timescale, seconds: units / timescale, sourceBox: box.path },
      timescale: sourcedTimescale,
    };
  };

  const parseFtyp = (box: Box) => {
    hasFtyp = true;
    if (!hasRange(box.payloadStart, 8, box.end)) {
      issue('fail', 'truncated-ftyp', box.start, box.path, 'The ftyp box is missing its major brand and minor version.');
      return;
    }
    const values: string[] = [fourCc(box.payloadStart)];
    const compatibleBytes = box.end - (box.payloadStart + 8);
    if (compatibleBytes % 4 !== 0) {
      issue('warn', 'misaligned-ftyp', box.start, box.path, 'The ftyp compatible-brand list has trailing bytes.');
    }
    const available = Math.floor(compatibleBytes / 4);
    const count = Math.min(available, limits.maxBrands - 1);
    for (let index = 0; index < count; index += 1) {
      values.push(fourCc(box.payloadStart + 8 + index * 4));
    }
    if (available > count) {
      issue('warn', 'brand-limit', box.start, box.path, `Only the first ${limits.maxBrands} brands were retained.`);
    }
    brands = { value: [...new Set(values)], sourceBox: box.path };
  };

  const parseHandler = (box: Box, track: MutableTrack) => {
    if (!hasRange(box.payloadStart, 12, box.end)) {
      issue('fail', 'truncated-hdlr', box.start, box.path, 'The track handler box is truncated.');
      return;
    }
    const value = fourCc(box.payloadStart + 8);
    track.handlerType = { value, sourceBox: box.path };
    track.type = handlerTrackType(value);
  };

  const parseTrackHeader = (box: Box, track: MutableTrack) => {
    if (!hasRange(box.payloadStart, 4, box.end)) {
      issue('fail', 'truncated-tkhd', box.start, box.path, 'The track header is truncated.');
      return;
    }
    const version = bytes[box.payloadStart];
    const widthOffset = box.payloadStart + (version === 1 ? 88 : 76);
    if (version !== 0 && version !== 1) {
      issue('warn', 'unsupported-tkhd-version', box.start, box.path, `Track header version ${version} is not supported.`);
      return;
    }
    if (!hasRange(widthOffset, 8, box.end)) {
      issue('fail', 'truncated-tkhd', box.start, box.path, 'The track display dimensions are truncated.');
      return;
    }
    const value = { width: u32(widthOffset) / 65_536, height: u32(widthOffset + 4) / 65_536 };
    if (value.width > 0 && value.height > 0) {
      track.displayDimensions = { value, sourceBox: box.path };
    }
  };

  const parseStts = (box: Box, track: MutableTrack) => {
    if (!hasRange(box.payloadStart, 8, box.end)) {
      issue('fail', 'truncated-stts', box.start, box.path, 'The decoding-time table header is truncated.');
      return;
    }
    const entryCount = u32(box.payloadStart + 4);
    const recordsStart = box.payloadStart + 8;
    if (entryCount > Math.floor((box.end - recordsStart) / 8)) {
      issue('fail', 'truncated-stts', box.start, box.path, `The stts box declares ${entryCount} entries beyond its available bytes.`);
      return;
    }
    if (entryCount > limits.maxBoxes) {
      issue('fail', 'stts-entry-limit', box.start, box.path, `The stts entry-count safety limit (${limits.maxBoxes}) was exceeded.`);
      return;
    }
    let sampleCount = 0;
    for (let index = 0; index < entryCount; index += 1) {
      const next = u32(recordsStart + index * 8);
      if (sampleCount > Number.MAX_SAFE_INTEGER - next) {
        issue('fail', 'stts-overflow', box.start, box.path, 'The stts sample count exceeds JavaScript’s safe integer range.');
        return;
      }
      sampleCount += next;
    }
    track.sttsFrameCount = { value: sampleCount, sourceBox: box.path };
  };

  const parseStsz = (box: Box, track: MutableTrack) => {
    if (!hasRange(box.payloadStart, 12, box.end)) {
      issue('fail', 'truncated-stsz', box.start, box.path, 'The sample-size table header is truncated.');
      return;
    }
    const sampleSize = u32(box.payloadStart + 4);
    const sampleCount = u32(box.payloadStart + 8);
    if (sampleSize === 0) {
      const sizesStart = box.payloadStart + 12;
      if (sampleCount > Math.floor((box.end - sizesStart) / 4)) {
        issue('fail', 'truncated-stsz', box.start, box.path, `The stsz box declares ${sampleCount} sample sizes beyond its available bytes.`);
        return;
      }
    }
    track.stszFrameCount = { value: sampleCount, sourceBox: box.path };
  };

  const parseSampleEntryChildren = (
    start: number,
    end: number,
    depth: number,
    parentPath: string,
    requiredConfig: string | null,
  ): Mp4SourcedValue<boolean> | null => {
    if (depth > limits.maxDepth) {
      issue('fail', 'depth-limit', start, parentPath, `The nesting-depth safety limit (${limits.maxDepth}) was reached.`);
      return requiredConfig ? { value: false, sourceBox: parentPath } : null;
    }
    maxDepthSeen = Math.max(maxDepthSeen, depth);
    let cursor = start;
    let config: Mp4SourcedValue<boolean> | null = requiredConfig
      ? { value: false, sourceBox: parentPath }
      : null;
    while (cursor < end && !stopped) {
      const child = nextBox(cursor, end, parentPath);
      if (!child) break;
      if (requiredConfig && child.type === requiredConfig) {
        config = { value: true, sourceBox: child.path };
      }
      cursor = child.end;
    }
    return config;
  };

  const parseStsd = (box: Box, track: MutableTrack, depth: number) => {
    if (!hasRange(box.payloadStart, 8, box.end)) {
      issue('fail', 'truncated-stsd', box.start, box.path, 'The sample-description table header is truncated.');
      return;
    }
    const entryCount = u32(box.payloadStart + 4);
    let cursor = box.payloadStart + 8;
    if (entryCount > Math.floor((box.end - cursor) / 8)) {
      issue('fail', 'truncated-stsd', box.start, box.path, `The stsd box declares ${entryCount} entries beyond its available bytes.`);
      return;
    }
    if (entryCount > limits.maxBoxes) {
      issue('fail', 'stsd-entry-limit', box.start, box.path, `The stsd entry-count safety limit (${limits.maxBoxes}) was exceeded.`);
      return;
    }
    for (let index = 0; index < entryCount && !stopped; index += 1) {
      const entry = nextBox(cursor, box.end, `${box.path}[${index}]`);
      if (!entry) return;
      if (!track.codec) track.codec = { value: entry.type, sourceBox: entry.path };
      if (VIDEO_SAMPLE_ENTRIES.has(entry.type)) {
        const fixedFieldsEnd = entry.payloadStart + 78;
        if (!hasRange(entry.payloadStart + 24, 4, entry.end) || fixedFieldsEnd > entry.end) {
          issue('fail', 'truncated-video-sample-entry', entry.start, entry.path, `Video sample entry ${entry.type} is truncated.`);
        } else {
          const dimensions: Mp4Dimensions = {
            width: u16(entry.payloadStart + 24),
            height: u16(entry.payloadStart + 26),
          };
          track.dimensions = { value: dimensions, sourceBox: entry.path };
          const required = entry.type === 'avc1' || entry.type === 'avc3' ? 'avcC' : 'hvcC';
          track.requiredConfigBox = required;
          track.configBoxPresent = parseSampleEntryChildren(
            fixedFieldsEnd,
            entry.end,
            depth + 1,
            entry.path,
            required,
          );
        }
      } else if (AUDIO_SAMPLE_ENTRIES.has(entry.type)) {
        if (!hasRange(entry.payloadStart + 8, 20, entry.end)) {
          issue('fail', 'truncated-audio-sample-entry', entry.start, entry.path, `Audio sample entry ${entry.type} is truncated.`);
        } else {
          const version = u16(entry.payloadStart + 8);
          const sampleRate = u32(entry.payloadStart + 24) / 65_536;
          if (sampleRate > 0) track.sampleRate = { value: sampleRate, sourceBox: entry.path };
          const childrenStart = entry.payloadStart + (version === 1 ? 44 : 28);
          if (version > 1) {
            issue('warn', 'unsupported-audio-sample-entry-version', entry.start, entry.path, `Audio sample-entry version ${version} is not supported.`);
          } else if (childrenStart <= entry.end) {
            parseSampleEntryChildren(childrenStart, entry.end, depth + 1, entry.path, null);
          }
        }
      }
      cursor = entry.end;
    }
  };

  const walk = (
    start: number,
    end: number,
    depth: number,
    parentPath: string,
    track: MutableTrack | null,
  ) => {
    if (depth > limits.maxDepth) {
      issue('fail', 'depth-limit', start, parentPath || 'file', `The nesting-depth safety limit (${limits.maxDepth}) was reached.`);
      return;
    }
    maxDepthSeen = Math.max(maxDepthSeen, depth);
    let cursor = start;
    while (cursor < end && !stopped) {
      const box = nextBox(cursor, end, parentPath);
      if (!box) break;
      if (box.type === 'ftyp') parseFtyp(box);
      else if (box.type === 'mvhd') {
        const timing = parseDuration(box, 'Movie header');
        movieDuration = timing.duration;
        movieTimescale = timing.timescale;
      } else if (box.type === 'mdhd' && track) {
        const timing = parseDuration(box, 'Media header');
        track.duration = timing.duration;
        track.mediaTimescale = timing.timescale;
      } else if (box.type === 'hdlr' && track) parseHandler(box, track);
      else if (box.type === 'tkhd' && track) parseTrackHeader(box, track);
      else if (box.type === 'stts' && track) parseStts(box, track);
      else if (box.type === 'stsz' && track) parseStsz(box, track);
      else if (box.type === 'stsd' && track) parseStsd(box, track, depth);
      else if (box.type === 'mdat') {
        hasMdat = true;
        mdatPayloadBytes += box.end - box.payloadStart;
      }

      if (box.type === 'trak') {
        if (tracks.length >= limits.maxTracks) {
          issue('fail', 'track-limit', box.start, box.path, `The track safety limit (${limits.maxTracks}) was reached.`);
        } else {
          const nextTrack = emptyTrack(tracks.length);
          tracks.push(nextTrack);
          walk(box.payloadStart, box.end, depth + 1, `${box.path}[${nextTrack.index}]`, nextTrack);
        }
      } else if (CONTAINERS.has(box.type)) {
        walk(box.payloadStart, box.end, depth + 1, box.path, track);
      }
      cursor = box.end;
    }
  };

  try {
    walk(0, bytes.byteLength, 0, '', null);
  } catch (error) {
    issue(
      'fail',
      'unexpected-parser-error',
      0,
      'file',
      `The parser safely stopped after an unexpected condition: ${error instanceof Error ? error.message : 'unknown error'}.`,
    );
  }

  for (const track of tracks) {
    if (track.stszFrameCount && track.sttsFrameCount
      && track.stszFrameCount.value !== track.sttsFrameCount.value) {
      issue(
        'warn',
        'sample-count-mismatch',
        0,
        track.stszFrameCount.sourceBox,
        `stsz reports ${track.stszFrameCount.value} samples while stts reports ${track.sttsFrameCount.value}.`,
      );
    }
    track.frameCount = track.stszFrameCount ?? track.sttsFrameCount;
    if (track.type === 'unknown' && track.codec) {
      if (VIDEO_SAMPLE_ENTRIES.has(track.codec.value)) track.type = 'video';
      else if (AUDIO_SAMPLE_ENTRIES.has(track.codec.value)) track.type = 'audio';
    }
    track.dimensions ??= track.displayDimensions;
  }

  return {
    fileBytes: bytes.byteLength,
    hasFtyp,
    brands,
    movieTimescale,
    movieDuration,
    tracks,
    trackCount: tracks.length,
    hasMdat,
    mdatPayloadBytes,
    boxCount,
    maxDepthSeen,
    issues,
  };
}
