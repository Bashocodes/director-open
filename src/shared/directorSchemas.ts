import { z } from 'zod';
import {
  CANONICAL_REEL_VISUAL_EFFECTS,
  DIRECTOR_VISUAL_EFFECT_VOCABULARY,
} from './reelVisualEffects';

export const DIRECTOR_MODELS = ['gpt-5.4', 'gpt-5.4-mini', 'gemini-3.5-flash'] as const;
export const DEFAULT_DIRECTOR_MODEL = DIRECTOR_MODELS[0];
export const DirectorModelSchema = z.enum(DIRECTOR_MODELS);

export const InheritanceChannelSchema = z.enum([
  'emotion',
  'material',
  'world',
  'framing',
  'palette',
  'identity',
  'silhouette',
  'lighting',
]);

const PercentageScoreSchema = z.number().min(0).max(100).overwrite((score) => (
  score > 0 && score < 1 ? Math.round(score * 1_000) / 10 : score
));

export const DirectionContractSchema = z.object({
  title: z.string(),
  objective: z.string(),
  inheritance: z.array(z.object({
    objectId: z.string(),
    sourceTitle: z.string(),
    channels: z.array(InheritanceChannelSchema),
    rationale: z.string(),
  }).strict()),
  locks: z.array(z.string()),
  exclusions: z.array(z.string()),
  conflicts: z.array(z.object({ issue: z.string(), resolution: z.string() }).strict()),
  coherence: PercentageScoreSchema,
}).strict();

export const StoryBeatSchema = z.object({
  id: z.string(),
  order: z.number().int().min(1).max(8),
  title: z.string(),
  emotion: z.string(),
  visualAction: z.string(),
  camera: z.string(),
  motion: z.string(),
  continuityLocks: z.array(z.string()),
}).strict();

export const StorySequenceSchema = z.object({
  title: z.string(),
  northStar: z.string(),
  arc: z.string(),
  beats: z.array(StoryBeatSchema).min(3).max(8),
}).strict();

export const ContinuityReportSchema = z.object({
  score: PercentageScoreSchema,
  findings: z.array(z.object({
    severity: z.enum(['info', 'warning', 'critical']),
    beatId: z.string(),
    issue: z.string(),
    repair: z.string(),
  }).strict()),
}).strict();

export const ReelAspectRatioSchema = z.enum(['9:16', '1:1', '16:9']);
export const ReelQualitySchema = z.enum(['draft', 'balanced', 'high', 'maximum']);
export const ReelEffectSchema = z.enum([
  'clean',
  'cinematic',
  'hdr',
  'warm',
  'cool',
  'mono',
  'dream',
  'vignette',
  'blur',
  'punch',
  'teal-orange',
  'vintage-film',
  'glow',
  'bleach-bypass',
]);
export const ReelVisualEffectSchema = z.enum(CANONICAL_REEL_VISUAL_EFFECTS);
export const DirectorVisualEffectVocabularySchema = z.enum(DIRECTOR_VISUAL_EFFECT_VOCABULARY);
export const ReelTransitionSchema = z.enum([
  'cut',
  'crossfade',
  'dip-black',
  'slide-left',
  'slide-right',
  'zoom',
  'soft-dissolve',
]);
export const ReelMotionSchema = z.enum([
  'still',
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
  'drift-up-left',
  'drift-down-right',
  'pulse',
  'hero-push',
  'arc-left',
  'arc-right',
  'float',
]);

/**
 * A deliberately flat tool envelope. Provider schemas handle this shape more
 * reliably than a large discriminated union; unused fields must be null or [].
 */
export const DirectorReelActionSchema = z.object({
  type: z.enum([
    'open_reel_studio',
    'add_clips',
    'remove_clips',
    'reorder_clips',
    'style_clips',
    'set_project',
    'request_render',
  ]),
  objectIds: z.array(z.string().max(160)).max(16),
  clipIds: z.array(z.string().max(160)).max(16),
  aspectRatio: ReelAspectRatioSchema.nullable(),
  fps: z.union([z.literal(24), z.literal(30)]).nullable(),
  quality: ReelQualitySchema.nullable(),
  effect: ReelEffectSchema.nullable(),
  visualEffect: DirectorVisualEffectVocabularySchema.nullable(),
  transition: ReelTransitionSchema.nullable(),
  motion: ReelMotionSchema.nullable(),
  duration: z.number().min(1).max(12).nullable(),
  intensity: z.number().min(0).max(100).nullable(),
  caption: z.string().max(180).nullable(),
}).strict();

export const ReelProjectContextSchema = z.object({
  open: z.boolean(),
  aspectRatio: ReelAspectRatioSchema,
  fps: z.union([z.literal(24), z.literal(30)]),
  quality: ReelQualitySchema,
  selectedClipIds: z.array(z.string().max(160)).max(16),
  clips: z.array(z.object({
    id: z.string().max(160),
    objectId: z.string().max(160).nullable(),
    title: z.string().max(240),
    duration: z.number().min(1).max(12),
    effect: ReelEffectSchema,
    visualEffect: ReelVisualEffectSchema.default('none'),
    transition: ReelTransitionSchema,
    motion: ReelMotionSchema,
    intensity: z.number().min(0).max(100),
    caption: z.string().max(180),
  }).strict()).max(16),
}).strict();

export const DirectorCanvasActionSchema = z.object({
  type: z.enum([
    'search_and_add',
    'select_objects',
    'set_inheritance',
    'remove_objects',
    'set_goal',
    'set_exclusions',
  ]),
  query: z.string().max(160).nullable(),
  count: z.number().int().min(1).max(6).nullable(),
  objectIds: z.array(z.string().max(160)).max(12),
  objectId: z.string().max(160).nullable(),
  channels: z.array(InheritanceChannelSchema).max(8),
  goal: z.string().max(1_000).nullable(),
  exclusions: z.array(z.string().max(160)).max(24),
}).strict();

export const DirectorResponseSchema = z.object({
  message: z.string(),
  mode: z.enum(['inspect', 'inherit', 'combine', 'create', 'animate', 'export']),
  directionContract: DirectionContractSchema.nullable(),
  sequence: StorySequenceSchema.nullable(),
  continuity: ContinuityReportSchema.nullable(),
  canvasActions: z.array(DirectorCanvasActionSchema).max(8),
  reelActions: z.array(DirectorReelActionSchema).max(8),
  suggestedActions: z.array(z.string()).max(5),
}).strict();

/** Provider-facing JSON Schema kept in lockstep with DirectorResponseSchema. */
export const DIRECTOR_RESPONSE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string' },
    mode: { type: 'string', enum: ['inspect', 'inherit', 'combine', 'create', 'animate', 'export'] },
    directionContract: {
      anyOf: [{
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          objective: { type: 'string' },
          inheritance: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                objectId: { type: 'string' },
                sourceTitle: { type: 'string' },
                channels: { type: 'array', items: { type: 'string', enum: InheritanceChannelSchema.options } },
                rationale: { type: 'string' },
              },
              required: ['objectId', 'sourceTitle', 'channels', 'rationale'],
            },
          },
          locks: { type: 'array', items: { type: 'string' } },
          exclusions: { type: 'array', items: { type: 'string' } },
          conflicts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { issue: { type: 'string' }, resolution: { type: 'string' } },
              required: ['issue', 'resolution'],
            },
          },
          coherence: { type: 'number' },
        },
        required: ['title', 'objective', 'inheritance', 'locks', 'exclusions', 'conflicts', 'coherence'],
      }, { type: 'null' }],
    },
    sequence: {
      anyOf: [{
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          northStar: { type: 'string' },
          arc: { type: 'string' },
          beats: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' }, order: { type: 'integer' },
                title: { type: 'string' }, emotion: { type: 'string' }, visualAction: { type: 'string' },
                camera: { type: 'string' }, motion: { type: 'string' },
                continuityLocks: { type: 'array', items: { type: 'string' } },
              },
              required: ['id', 'order', 'title', 'emotion', 'visualAction', 'camera', 'motion', 'continuityLocks'],
            },
          },
        },
        required: ['title', 'northStar', 'arc', 'beats'],
      }, { type: 'null' }],
    },
    continuity: {
      anyOf: [{
        type: 'object',
        additionalProperties: false,
        properties: {
          score: { type: 'number' },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
                beatId: { type: 'string' }, issue: { type: 'string' }, repair: { type: 'string' },
              },
              required: ['severity', 'beatId', 'issue', 'repair'],
            },
          },
        },
        required: ['score', 'findings'],
      }, { type: 'null' }],
    },
    canvasActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['search_and_add', 'select_objects', 'set_inheritance', 'remove_objects', 'set_goal', 'set_exclusions'],
          },
          query: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          count: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          objectIds: { type: 'array', items: { type: 'string' } },
          objectId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          channels: { type: 'array', items: { type: 'string', enum: InheritanceChannelSchema.options } },
          goal: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          exclusions: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'query', 'count', 'objectIds', 'objectId', 'channels', 'goal', 'exclusions'],
      },
    },
    reelActions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: {
            type: 'string',
            enum: ['open_reel_studio', 'add_clips', 'remove_clips', 'reorder_clips', 'style_clips', 'set_project', 'request_render'],
          },
          objectIds: { type: 'array', items: { type: 'string' } },
          clipIds: { type: 'array', items: { type: 'string' } },
          aspectRatio: { anyOf: [{ type: 'string', enum: ReelAspectRatioSchema.options }, { type: 'null' }] },
          fps: { anyOf: [{ type: 'integer', enum: [24, 30] }, { type: 'null' }] },
          quality: { anyOf: [{ type: 'string', enum: ReelQualitySchema.options }, { type: 'null' }] },
          effect: { anyOf: [{ type: 'string', enum: ReelEffectSchema.options }, { type: 'null' }] },
          visualEffect: { anyOf: [{ type: 'string', enum: DirectorVisualEffectVocabularySchema.options }, { type: 'null' }] },
          transition: { anyOf: [{ type: 'string', enum: ReelTransitionSchema.options }, { type: 'null' }] },
          motion: { anyOf: [{ type: 'string', enum: ReelMotionSchema.options }, { type: 'null' }] },
          duration: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          intensity: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          caption: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: [
          'type', 'objectIds', 'clipIds', 'aspectRatio', 'fps', 'quality', 'effect', 'visualEffect',
          'transition', 'motion', 'duration', 'intensity', 'caption',
        ],
      },
    },
    suggestedActions: { type: 'array', items: { type: 'string' } },
  },
  required: ['message', 'mode', 'directionContract', 'sequence', 'continuity', 'canvasActions', 'reelActions', 'suggestedActions'],
};

export const VisualSummarySchema = z.object({
  emotion: z.array(z.string()).max(12),
  materials: z.array(z.string()).max(12),
  composition: z.array(z.string()).max(12),
  palette: z.array(z.string()).max(12),
  lighting: z.array(z.string()).max(12),
  camera: z.array(z.string()).max(12),
  world: z.array(z.string()).max(12),
  style: z.array(z.string()).max(12),
  subjects: z.array(z.string()).max(12),
}).strict();

export const DirectorCanvasObjectSchema = z.object({
  id: z.string().max(160),
  assetId: z.string().max(160).nullable(),
  title: z.string().max(240),
  source: z.enum(['UPLOAD', 'CREATED', 'CONTRACT', 'STORY']),
  kind: z.enum(['reference', 'upload', 'created', 'contract', 'beat']),
  selected: z.boolean(),
  inherit: z.array(InheritanceChannelSchema),
  locks: z.array(z.string()).max(20),
  decodedSummary: VisualSummarySchema,
}).strict();

export const DirectorContextSchema = z.object({
  mode: z.enum(['inspect', 'inherit', 'combine', 'create', 'animate', 'export']),
  goal: z.string().max(1_000),
  exclusions: z.array(z.string()).max(24),
  canvas: z.array(DirectorCanvasObjectSchema).max(120),
  visibleSearch: z.object({
    query: z.string().max(160),
    assets: z.array(z.object({
      assetId: z.string().max(160),
      title: z.string().max(240),
      decodedSummary: VisualSummarySchema,
    }).strict()).max(24),
  }).strict().nullable(),
  recentConversation: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().max(4_000),
    label: z.string().max(120).nullable(),
  }).strict()).max(10),
  directionContract: DirectionContractSchema.nullable(),
  sequence: StorySequenceSchema.nullable(),
  reelProject: ReelProjectContextSchema.nullable().default(null),
}).strict();

export const DirectorRequestSchema = z.object({
  message: z.string().min(1).max(4_000),
  model: DirectorModelSchema.default(DEFAULT_DIRECTOR_MODEL),
  sessionId: z.string().min(8).max(100),
  context: DirectorContextSchema,
}).strict();

export type DirectorModel = z.infer<typeof DirectorModelSchema>;
export type InheritanceChannel = z.infer<typeof InheritanceChannelSchema>;
export type DirectionContract = z.infer<typeof DirectionContractSchema>;
export type StoryBeat = z.infer<typeof StoryBeatSchema>;
export type StorySequence = z.infer<typeof StorySequenceSchema>;
export type ContinuityReport = z.infer<typeof ContinuityReportSchema>;
export type DirectorCanvasAction = z.infer<typeof DirectorCanvasActionSchema>;
export type ReelAspectRatio = z.infer<typeof ReelAspectRatioSchema>;
export type ReelQuality = z.infer<typeof ReelQualitySchema>;
export type ReelEffect = z.infer<typeof ReelEffectSchema>;
export type ReelVisualEffect = z.infer<typeof ReelVisualEffectSchema>;
export type DirectorVisualEffectVocabulary = z.infer<typeof DirectorVisualEffectVocabularySchema>;
export type ReelTransition = z.infer<typeof ReelTransitionSchema>;
export type ReelMotion = z.infer<typeof ReelMotionSchema>;
export type DirectorReelAction = z.infer<typeof DirectorReelActionSchema>;
export type ReelProjectContext = z.infer<typeof ReelProjectContextSchema>;
export type DirectorResponse = z.infer<typeof DirectorResponseSchema>;
export type VisualSummary = z.infer<typeof VisualSummarySchema>;
export type DirectorContext = z.infer<typeof DirectorContextSchema>;
