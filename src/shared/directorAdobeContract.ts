import { z } from 'zod';
import { TextLayerSchema } from './directorSchemas';

export const DIRECTOR_ADOBE_RENDER_PLAN_VERSION = 1;
export const DIRECTOR_ADOBE_WORKING_SPACE = 'Rec.2100 HLG Scene W100';
export const DIRECTOR_ADOBE_PIXEL_SORT_ID = 'director-pixel-sort';
export const DIRECTOR_ADOBE_BEAT_SYNC_ID = 'director-beat-sync';
export const DIRECTOR_ADOBE_PIXEL_SORT_DISPLAY_NAME = 'Director Pixel Sort';
export const DIRECTOR_ADOBE_BEAT_SYNC_DISPLAY_NAME = 'Director Beat Sync';
export const MAX_DIRECTOR_ADOBE_PLAN_JSON_BYTES = 5 * 1_048_576;
export const MAX_DIRECTOR_ADOBE_DURATION_SECONDS = 90;

const SafeRelativeMediaPathSchema = z.string()
  .min(1)
  .max(512)
  .refine(
    (value) => /^media\/[^/\\]+$/.test(value) && !value.includes('..'),
    'Media paths must be one safe file directly inside media/.',
  );

const SafeOutputFilenameSchema = z.string()
  .min(5)
  .max(240)
  .refine(
    (value) => /^[^/\\]+\.mov$/i.test(value) && !value.includes('..'),
    'Adobe output must be one safe .mov filename.',
  );

export const DirectorAdobeMediaEntrySchema = z.object({
  id: z.string().min(1).max(240),
  kind: z.enum(['clip', 'audio']),
  relativePath: SafeRelativeMediaPathSchema,
  originalName: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(240),
  bytes: z.number().int().nonnegative(),
  available: z.boolean(),
}).strict();

export const DirectorAdobeClipPlanSchema = z.object({
  clipId: z.string().min(1).max(240),
  title: z.string().min(1).max(512),
  mediaId: z.string().min(1).max(240),
  startSeconds: z.number().finite().nonnegative().max(MAX_DIRECTOR_ADOBE_DURATION_SECONDS),
  durationSeconds: z.number().finite().positive().max(12),
  incomingOverlapSeconds: z.number().finite().nonnegative().max(2),
  sourceTimeSeconds: z.number().finite().nonnegative().max(86_400),
  gradeStack: z.array(z.string().min(1).max(160)).max(5),
  visualEffectStack: z.array(z.string().min(1).max(160)).max(5),
  /** Effects already rendered by Director's shared exact frame engine. */
  preparedVisualEffectStack: z.array(z.string().min(1).max(160)).max(5).optional(),
  /** The prepared plate already includes the selected Director camera move. */
  preparedMotion: z.boolean().optional(),
  transition: z.string().min(1).max(160),
  transitionDurationSeconds: z.number().finite().nonnegative().max(2),
  motion: z.string().min(1).max(160),
  intensity: z.number().finite().min(0).max(100),
  pluginParams: z.record(
    z.string().min(1).max(160),
    z.record(z.string().min(1).max(80), z.unknown()),
  ),
  textLayers: z.array(TextLayerSchema),
}).strict();

export const DirectorAdobeRenderPlanSchema = z.object({
  version: z.literal(DIRECTOR_ADOBE_RENDER_PLAN_VERSION),
  product: z.literal('director-open'),
  backend: z.literal('after-effects'),
  projectId: z.string().min(1).max(240),
  title: z.string().min(1).max(512),
  composition: z.object({
    name: z.string().min(1).max(512),
    width: z.number().int().min(16).max(8_192),
    height: z.number().int().min(16).max(8_192),
    pixelAspect: z.literal(1),
    frameRate: z.union([z.literal(24), z.literal(30)]),
    durationSeconds: z.number().finite().positive().max(MAX_DIRECTOR_ADOBE_DURATION_SECONDS),
    bitsPerChannel: z.literal(32),
    workingSpace: z.literal(DIRECTOR_ADOBE_WORKING_SPACE),
  }).strict(),
  output: z.object({
    container: z.literal('mov'),
    codec: z.literal('prores-4444'),
    bitDepth: z.literal(12),
    colorSpace: z.literal('Rec.2100 HLG'),
    filename: SafeOutputFilenameSchema,
    outputModuleTemplateCandidates: z.array(z.string().min(1).max(240)).min(1).max(8),
    fallbackOutputModuleProfiles: z.array(z.object({
      codec: z.literal('prores-422-intermediate'),
      bitDepth: z.literal(10),
      colorSpace: z.literal('Rec.2100 HLG'),
      postProcess: z.literal('hevc-main10-hlg'),
      outputModuleTemplateCandidates: z.array(z.string().min(1).max(240)).min(1).max(8),
    }).strict()).max(2),
  }).strict(),
  timeline: z.object({
    clips: z.array(DirectorAdobeClipPlanSchema).min(1).max(16),
    beats: z.object({
      enabled: z.boolean(),
      source: z.literal('native-audio-amplitude'),
      markerLayerName: z.literal('Director Beat Map'),
      threshold: z.number().finite().positive(),
      riseRatio: z.number().finite().min(1),
      minimumGapSeconds: z.number().finite().positive().max(2),
      pulseDurationSeconds: z.number().finite().positive().max(1),
    }).strict(),
  }).strict(),
  media: z.array(DirectorAdobeMediaEntrySchema).min(1).max(17),
  effectContracts: z.object({
    pixelSort: z.object({
      id: z.literal(DIRECTOR_ADOBE_PIXEL_SORT_ID),
      displayName: z.literal(DIRECTOR_ADOBE_PIXEL_SORT_DISPLAY_NAME),
      beatAmountParameter: z.literal('Beat Amount'),
    }).strict(),
    beatSync: z.object({
      id: z.literal(DIRECTOR_ADOBE_BEAT_SYNC_ID),
      displayName: z.literal(DIRECTOR_ADOBE_BEAT_SYNC_DISPLAY_NAME),
    }).strict(),
  }).strict(),
}).strict().superRefine((plan, context) => {
  const mediaIds = new Map<string, typeof plan.media[number]>();
  const mediaPaths = new Set<string>();
  const clipIds = new Set<string>();
  let audioCount = 0;
  for (const [index, entry] of plan.media.entries()) {
    if (mediaIds.has(entry.id)) {
      context.addIssue({
        code: 'custom',
        path: ['media', index, 'id'],
        message: `Duplicate media id: ${entry.id}`,
      });
    }
    if (mediaPaths.has(entry.relativePath)) {
      context.addIssue({
        code: 'custom',
        path: ['media', index, 'relativePath'],
        message: `Duplicate media path: ${entry.relativePath}`,
      });
    }
    if (entry.available !== (entry.bytes > 0)) {
      context.addIssue({
        code: 'custom',
        path: ['media', index, 'bytes'],
        message: 'Packaged media must have bytes; unavailable placeholders must have zero bytes.',
      });
    }
    if (entry.kind === 'audio') audioCount += 1;
    mediaIds.set(entry.id, entry);
    mediaPaths.add(entry.relativePath);
  }
  if (audioCount > 1) {
    context.addIssue({
      code: 'custom',
      path: ['media'],
      message: 'An Adobe handoff may contain at most one audio file.',
    });
  }
  for (const [index, clip] of plan.timeline.clips.entries()) {
    if (clipIds.has(clip.clipId)) {
      context.addIssue({
        code: 'custom',
        path: ['timeline', 'clips', index, 'clipId'],
        message: `Duplicate clip id: ${clip.clipId}`,
      });
    }
    clipIds.add(clip.clipId);
    const media = mediaIds.get(clip.mediaId);
    if (!media) {
      context.addIssue({
        code: 'custom',
        path: ['timeline', 'clips', index, 'mediaId'],
        message: `Unknown media id: ${clip.mediaId}`,
      });
    } else if (media.kind !== 'clip') {
      context.addIssue({
        code: 'custom',
        path: ['timeline', 'clips', index, 'mediaId'],
        message: `Clip media id points to ${media.kind}: ${clip.mediaId}`,
      });
    }
    if (clip.startSeconds + clip.durationSeconds > plan.composition.durationSeconds + 0.001) {
      context.addIssue({
        code: 'custom',
        path: ['timeline', 'clips', index, 'durationSeconds'],
        message: 'Clip extends beyond the composition duration.',
      });
    }
    if (index === 0 && (clip.startSeconds > 0.001 || clip.incomingOverlapSeconds > 0.001)) {
      context.addIssue({
        code: 'custom',
        path: ['timeline', 'clips', index, 'startSeconds'],
        message: 'The first clip must start at zero without an incoming overlap.',
      });
    }
    const previous = index > 0 ? plan.timeline.clips[index - 1] : undefined;
    if (previous && clip.startSeconds + 0.001 < previous.startSeconds) {
      context.addIssue({
        code: 'custom',
        path: ['timeline', 'clips', index, 'startSeconds'],
        message: 'Timeline clips must be ordered by start time.',
      });
    }
  }
  const hasAudio = audioCount === 1;
  if (plan.timeline.beats.enabled && !hasAudio) {
    context.addIssue({
      code: 'custom',
      path: ['timeline', 'beats', 'enabled'],
      message: 'Native audio beat analysis requires packaged audio.',
    });
  }
});

export type DirectorAdobeMediaEntry = z.infer<typeof DirectorAdobeMediaEntrySchema>;
export type DirectorAdobeClipPlan = z.infer<typeof DirectorAdobeClipPlanSchema>;
export type DirectorAdobeRenderPlan = z.infer<typeof DirectorAdobeRenderPlanSchema>;

export function parseDirectorAdobeRenderPlan(value: unknown): DirectorAdobeRenderPlan {
  return DirectorAdobeRenderPlanSchema.parse(value);
}
