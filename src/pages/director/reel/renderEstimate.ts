import type { ReelQuality } from '../../../shared/directorSchemas';
import { reelDimensions } from './catalog';
import type { ReelProject } from './types';

/**
 * Rough render cost estimates.
 *
 * These exist because a person choosing a quality deserves to know that one
 * option finishes in a minute and another takes a quarter of an hour and
 * produces a file too large to post. They are estimates, not promises: the
 * real cost depends on the device, the effect stack, and the source material.
 *
 * Calibration (2026-07-25, Apple silicon laptop, single-thread FFmpeg.wasm):
 * a 12 s 9:16 reel at `maximum` (1080x1920, 360 frames, one structural effect)
 * took about 13 minutes and produced 160.8 MB. That works out near
 * 0.9 s per megapixel per frame, and ~107 Mbit/s at CRF 12. Every other
 * figure below is scaled from that single measurement, so treat the absolute
 * numbers as an order of magnitude and the ratios between qualities as sound.
 */

const SECONDS_PER_MEGAPIXEL_FRAME = 0.9;

/** Approximate delivered bitrate in megabits per second, by quality. */
const MEGABITS_PER_SECOND: Record<ReelQuality, number> = {
  draft: 8,
  balanced: 20,
  high: 55,
  maximum: 107,
};

/** Effect stacks that run per pixel in JavaScript add a second pass over every frame. */
const STRUCTURAL_PASS_SHARE = 0.5;

export function estimateRenderSeconds(options: {
  width: number;
  height: number;
  frameCount: number;
  hasStructuralPass: boolean;
}) {
  const megapixels = (options.width * options.height) / 1_000_000;
  const base = megapixels * options.frameCount * SECONDS_PER_MEGAPIXEL_FRAME;
  return base * (options.hasStructuralPass ? 1 + STRUCTURAL_PASS_SHARE : 1);
}

export function estimateOutputBytes(options: {
  quality: ReelQuality;
  durationSeconds: number;
}) {
  const megabits = MEGABITS_PER_SECOND[options.quality] * options.durationSeconds;
  return (megabits * 1_000_000) / 8;
}

export function formatEstimatedDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 45) return `~${Math.max(5, Math.round(seconds / 5) * 5)}s`;
  const minutes = seconds / 60;
  if (minutes < 10) return `~${Math.max(1, Math.round(minutes))} min`;
  return `~${Math.round(minutes / 5) * 5} min`;
}

export function formatEstimatedBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes >= 1_000_000_000) return `~${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `~${Math.round(bytes / 1_048_576)} MB`;
  return `~${Math.round(bytes / 1_024)} KB`;
}

export type RenderEstimate = {
  seconds: number;
  bytes: number;
  durationLabel: string;
  bytesLabel: string;
  /** True when the projected file is awkward to share on social platforms. */
  oversized: boolean;
  /** True when the projected wait is long enough to deserve a warning. */
  slow: boolean;
};

/** Files past this are painful to upload and often re-encoded hard by platforms. */
const OVERSIZED_BYTES = 250 * 1_048_576;
const SLOW_SECONDS = 8 * 60;

export function estimateRender(
  project: ReelProject,
  options: { durationSeconds: number; quality?: ReelQuality; hasStructuralPass?: boolean },
): RenderEstimate {
  const quality = options.quality ?? project.quality;
  const { width, height } = reelDimensions(project.aspectRatio, quality);
  const frameCount = Math.max(1, Math.round(options.durationSeconds * project.fps));
  const seconds = estimateRenderSeconds({
    width,
    height,
    frameCount,
    hasStructuralPass: options.hasStructuralPass ?? false,
  });
  const bytes = estimateOutputBytes({ quality, durationSeconds: options.durationSeconds });
  return {
    seconds,
    bytes,
    durationLabel: formatEstimatedDuration(seconds),
    bytesLabel: formatEstimatedBytes(bytes),
    oversized: bytes > OVERSIZED_BYTES,
    slow: seconds > SLOW_SECONDS,
  };
}
