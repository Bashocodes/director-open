export type VerifyStatus = 'ok' | 'warn' | 'fail';

export type VerifyValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];

export type VerifyReportEntry = {
  field: string;
  value: VerifyValue;
  sourceBox: string | null;
  status: VerifyStatus;
  message: string;
};

export type VerifyReport = {
  version: 1;
  verdict: VerifyStatus;
  entries: VerifyReportEntry[];
};

export type VerifyExpectations = {
  durationSeconds: number;
  durationToleranceSeconds: number;
  width: number;
  height: number;
  fps: number;
  expectAudio: boolean;
};

export type Mp4ParseLimits = {
  maxDepth: number;
  maxBoxes: number;
  maxIssues: number;
  maxTracks: number;
  maxBrands: number;
};

export type Mp4ParseIssue = {
  status: 'warn' | 'fail';
  code: string;
  offset: number;
  sourceBox: string;
  message: string;
};

export type Mp4SourcedValue<T> = {
  value: T;
  sourceBox: string;
};

export type Mp4Duration = {
  units: number;
  timescale: number;
  seconds: number;
  sourceBox: string;
};

export type Mp4Dimensions = {
  width: number;
  height: number;
};

export type Mp4TrackType = 'video' | 'audio' | 'subtitle' | 'metadata' | 'hint' | 'unknown';

export type ParsedMp4Track = {
  index: number;
  type: Mp4TrackType;
  handlerType: Mp4SourcedValue<string> | null;
  mediaTimescale: Mp4SourcedValue<number> | null;
  duration: Mp4Duration | null;
  codec: Mp4SourcedValue<string> | null;
  dimensions: Mp4SourcedValue<Mp4Dimensions> | null;
  displayDimensions: Mp4SourcedValue<Mp4Dimensions> | null;
  requiredConfigBox: string | null;
  configBoxPresent: Mp4SourcedValue<boolean> | null;
  sttsFrameCount: Mp4SourcedValue<number> | null;
  stszFrameCount: Mp4SourcedValue<number> | null;
  frameCount: Mp4SourcedValue<number> | null;
  sampleRate: Mp4SourcedValue<number> | null;
};

export type ParsedMp4 = {
  fileBytes: number;
  hasFtyp: boolean;
  brands: Mp4SourcedValue<readonly string[]> | null;
  movieTimescale: Mp4SourcedValue<number> | null;
  movieDuration: Mp4Duration | null;
  tracks: ParsedMp4Track[];
  trackCount: number;
  hasMdat: boolean;
  mdatPayloadBytes: number;
  boxCount: number;
  maxDepthSeen: number;
  issues: Mp4ParseIssue[];
};
