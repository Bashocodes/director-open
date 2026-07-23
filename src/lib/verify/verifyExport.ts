import { parseMp4 } from './mp4Parser';
import type {
  ParsedMp4,
  ParsedMp4Track,
  VerifyExpectations,
  VerifyReport,
  VerifyReportEntry,
  VerifyStatus,
  VerifyValue,
} from './types';

const FAMILIAR_MP4_BRANDS = new Set([
  'isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6',
  'mp41', 'mp42', 'avc1', 'hvc1', 'M4V ', 'M4A ',
]);

function entry(
  field: string,
  value: VerifyValue,
  sourceBox: string | null,
  status: VerifyStatus,
  message: string,
): VerifyReportEntry {
  return { field, value, sourceBox, status, message };
}

function verdict(entries: readonly VerifyReportEntry[]): VerifyStatus {
  if (entries.some((item) => item.status === 'fail')) return 'fail';
  if (entries.some((item) => item.status === 'warn')) return 'warn';
  return 'ok';
}

function formatBytes(bytes: number) {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function actualDuration(parsed: ParsedMp4) {
  if (parsed.movieDuration) return parsed.movieDuration;
  return parsed.tracks
    .map((track) => track.duration)
    .filter((duration) => duration !== null)
    .sort((left, right) => right.seconds - left.seconds)[0] ?? null;
}

function videoTrack(parsed: ParsedMp4) {
  return parsed.tracks.find((track) => track.type === 'video') ?? null;
}

function audioTrack(parsed: ParsedMp4) {
  return parsed.tracks.find((track) => track.type === 'audio') ?? null;
}

function configEntry(track: ParsedMp4Track): VerifyReportEntry {
  const codec = track.codec?.value ?? 'unknown';
  const required = track.requiredConfigBox;
  if (!required) {
    return entry(
      'video-codec',
      codec,
      track.codec?.sourceBox ?? 'moov/trak',
      'warn',
      `Video codec ${codec} is present, but this verifier does not know its configuration box — review recommended.`,
    );
  }
  const present = track.configBoxPresent?.value === true;
  const requestedCodec = codec === 'avc1' || codec === 'avc3';
  const status: VerifyStatus = !present ? 'fail' : requestedCodec ? 'ok' : 'warn';
  return entry(
    'video-codec',
    codec,
    track.configBoxPresent?.sourceBox ?? track.codec?.sourceBox ?? 'moov/trak',
    status,
    present && requestedCodec
      ? `Video codec ${codec} includes ${required} configuration — ok.`
      : present
        ? `Video codec ${codec} includes ${required} configuration, but this renderer requests H.264 — review recommended.`
        : `Video codec ${codec} is missing its required ${required} configuration — check failed.`,
  );
}

export function verifyExport(bytes: Uint8Array, expectations: VerifyExpectations): VerifyReport {
  const parsed = parseMp4(bytes);
  const entries: VerifyReportEntry[] = [];

  const fileStatus: VerifyStatus = bytes.byteLength < 1_024
    ? 'fail'
    : !parsed.hasMdat || parsed.mdatPayloadBytes === 0
      ? 'fail'
      : bytes.byteLength > 1_073_741_824
        ? 'warn'
        : 'ok';
  entries.push(entry(
    'file-size',
    bytes.byteLength,
    'file',
    fileStatus,
    bytes.byteLength < 1_024
      ? `File size ${formatBytes(bytes.byteLength)} is below the 1 KB sanity floor — check failed.`
      : !parsed.hasMdat
        ? `File size ${formatBytes(bytes.byteLength)}, but no mdat media-data box was found — check failed.`
        : parsed.mdatPayloadBytes === 0
          ? `File size ${formatBytes(bytes.byteLength)}, but the mdat media-data box is empty — check failed.`
          : bytes.byteLength > 1_073_741_824
            ? `File size ${formatBytes(bytes.byteLength)} exceeds 1 GB — review recommended.`
            : `File size ${formatBytes(bytes.byteLength)} with ${formatBytes(parsed.mdatPayloadBytes)} of media data — ok.`,
  ));

  const parseFailures = parsed.issues.filter((issue) => issue.status === 'fail');
  const parseWarnings = parsed.issues.filter((issue) => issue.status === 'warn');
  const parseStatus: VerifyStatus = parseFailures.length ? 'fail' : parseWarnings.length ? 'warn' : 'ok';
  const firstIssue = parseFailures[0] ?? parseWarnings[0];
  entries.push(entry(
    'container-integrity',
    `${parsed.boxCount} boxes`,
    firstIssue?.sourceBox ?? 'file',
    parseStatus,
    firstIssue
      ? `${firstIssue.message} ${parsed.issues.length} parser issue${parsed.issues.length === 1 ? '' : 's'} found — ${parseStatus === 'fail' ? 'check failed' : 'review recommended'}.`
      : `${parsed.boxCount} ISO-BMFF boxes parsed within safety limits — ok.`,
  ));

  const brandValues = parsed.brands?.value ?? [];
  const familiarMajorBrand = brandValues.length > 0 && FAMILIAR_MP4_BRANDS.has(brandValues[0]);
  const brandStatus: VerifyStatus = !parsed.hasFtyp || brandValues.length === 0
    ? 'fail'
    : familiarMajorBrand ? 'ok' : 'warn';
  entries.push(entry(
    'brands',
    brandValues,
    parsed.brands?.sourceBox ?? 'file',
    brandStatus,
    familiarMajorBrand
      ? `MP4 brands ${brandValues.join(', ')} — ok.`
      : brandValues.length > 0
        ? `MP4 major brand ${brandValues[0]} is unfamiliar; declared brands: ${brandValues.join(', ')} — review recommended.`
        : 'No usable ftyp brand declaration was found — check failed.',
  ));

  const movieTimescale = parsed.movieTimescale?.value ?? null;
  const movieTimescaleStatus: VerifyStatus = movieTimescale === null ? 'warn' : movieTimescale > 0 ? 'ok' : 'fail';
  entries.push(entry(
    'movie-timescale',
    movieTimescale,
    parsed.movieTimescale?.sourceBox ?? 'moov/mvhd',
    movieTimescaleStatus,
    movieTimescale === null
      ? 'Movie timescale is unavailable — review recommended.'
      : movieTimescale > 0
        ? `Movie timescale ${movieTimescale.toLocaleString('en-US')} units/s — ok.`
        : 'Movie timescale is zero — check failed.',
  ));

  const duration = actualDuration(parsed);
  const durationDelta = duration
    ? Math.abs(duration.seconds - expectations.durationSeconds)
    : Number.POSITIVE_INFINITY;
  const durationOk = duration !== null && durationDelta <= expectations.durationToleranceSeconds;
  entries.push(entry(
    'duration',
    duration ? duration.seconds : null,
    duration?.sourceBox ?? 'moov/mvhd',
    durationOk ? 'ok' : 'fail',
    duration
      ? `Duration ${duration.seconds.toFixed(2)}s, expected ${expectations.durationSeconds.toFixed(2)}s ± ${expectations.durationToleranceSeconds.toFixed(2)}s — ${durationOk ? 'ok' : 'check failed'}.`
      : `Duration unavailable, expected ${expectations.durationSeconds.toFixed(2)}s ± ${expectations.durationToleranceSeconds.toFixed(2)}s — check failed.`,
  ));

  for (const track of parsed.tracks) {
    const timescale = track.mediaTimescale?.value ?? null;
    const status: VerifyStatus = timescale === null ? 'warn' : timescale > 0 ? 'ok' : 'fail';
    entries.push(entry(
      `track-${track.index + 1}-media-timescale`,
      timescale,
      track.mediaTimescale?.sourceBox ?? `moov/trak[${track.index}]`,
      status,
      timescale === null
        ? `Track ${track.index + 1} (${track.type}) media timescale is unavailable — review recommended.`
        : timescale > 0
          ? `Track ${track.index + 1} (${track.type}) media timescale ${timescale.toLocaleString('en-US')} units/s — ok.`
          : `Track ${track.index + 1} (${track.type}) media timescale is zero — check failed.`,
    ));
  }

  const trackTypes = parsed.tracks.map((track) => track.type);
  entries.push(entry(
    'tracks',
    trackTypes,
    'moov',
    parsed.trackCount > 0 ? 'ok' : 'fail',
    parsed.trackCount > 0
      ? `${parsed.trackCount} track${parsed.trackCount === 1 ? '' : 's'}: ${trackTypes.join(', ')} — ok.`
      : 'No media tracks were found — check failed.',
  ));

  const video = videoTrack(parsed);
  entries.push(entry(
    'video-track',
    video !== null,
    video?.handlerType?.sourceBox ?? 'moov',
    video ? 'ok' : 'fail',
    video ? 'A video track is present — ok.' : 'No video track was found — check failed.',
  ));
  if (video) entries.push(configEntry(video));

  const dimensions = video?.dimensions?.value ?? null;
  const resolutionOk = dimensions?.width === expectations.width && dimensions.height === expectations.height;
  entries.push(entry(
    'resolution',
    dimensions ? `${dimensions.width}×${dimensions.height}` : null,
    video?.dimensions?.sourceBox ?? 'moov/trak',
    resolutionOk ? 'ok' : 'fail',
    dimensions
      ? `Resolution ${dimensions.width}×${dimensions.height}, expected ${expectations.width}×${expectations.height} — ${resolutionOk ? 'ok' : 'check failed'}.`
      : `Resolution unavailable, expected ${expectations.width}×${expectations.height} — check failed.`,
  ));

  const frames = video?.frameCount?.value ?? null;
  const frameStatus: VerifyStatus = frames === null ? 'warn' : frames > 0 ? 'ok' : 'fail';
  const expectedFrames = Math.max(1, Math.round(expectations.durationSeconds * expectations.fps));
  entries.push(entry(
    'video-frames',
    frames,
    video?.frameCount?.sourceBox ?? 'moov/trak',
    frameStatus,
    frames === null
      ? `Frame count is unavailable; approximately ${expectedFrames} frames were expected — review recommended.`
      : frames > 0
        ? `${frames} video frame${frames === 1 ? '' : 's'} found; approximately ${expectedFrames} expected — ok.`
        : 'The video sample tables report zero frames — check failed.',
  ));

  const audio = audioTrack(parsed);
  const audioPresenceStatus: VerifyStatus = expectations.expectAudio
    ? audio ? 'ok' : 'fail'
    : audio ? 'warn' : 'ok';
  entries.push(entry(
    'audio-track',
    audio !== null,
    audio?.handlerType?.sourceBox ?? 'moov',
    audioPresenceStatus,
    expectations.expectAudio
      ? audio ? 'An expected audio track is present — ok.' : 'Audio was expected, but no audio track was found — check failed.'
      : audio ? 'An audio track is present although this project did not expect one — review recommended.' : 'No audio track was expected or found — ok.',
  ));
  if (audio) {
    const codec = audio.codec?.value ?? null;
    const codecStatus: VerifyStatus = codec === 'mp4a' ? 'ok' : 'warn';
    entries.push(entry(
      'audio-codec',
      codec,
      audio.codec?.sourceBox ?? 'moov/trak',
      codecStatus,
      codec === 'mp4a'
        ? 'Audio codec sample entry mp4a — ok.'
        : codec
          ? `Audio codec sample entry ${codec}, but this renderer requests mp4a — review recommended.`
          : 'Audio codec is unavailable — review recommended.',
    ));
    const rate = audio.sampleRate?.value ?? null;
    entries.push(entry(
      'audio-sample-rate',
      rate,
      audio.sampleRate?.sourceBox ?? 'moov/trak',
      rate && rate > 0 ? 'ok' : 'warn',
      rate && rate > 0
        ? `Audio sample rate ${rate.toLocaleString('en-US')} Hz — ok.`
        : 'Audio sample rate is unavailable — review recommended.',
    ));
  }

  return { version: 1, verdict: verdict(entries), entries };
}
