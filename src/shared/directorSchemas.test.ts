import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_RESPONSE_JSON_SCHEMA,
  DirectorModelSchema,
  DirectorVisualEffectVocabularySchema,
  DirectorRequestSchema,
  DirectorResponseSchema,
  ReelProjectContextSchema,
  ReelVisualEffectSchema,
} from './directorSchemas';
import {
  CANONICAL_REEL_VISUAL_EFFECTS,
  DIRECTOR_VISUAL_EFFECT_VOCABULARY,
  RETIRED_REEL_VISUAL_EFFECTS,
} from './reelVisualEffects';

const emptySummary = {
  emotion: [], materials: [], composition: [], palette: [], lighting: [],
  camera: [], world: [], style: [], subjects: [],
};

const emptyContext = {
  mode: 'combine', goal: '', exclusions: [], canvas: [], visibleSearch: null,
  recentConversation: [], directionContract: null, sequence: null, reelProject: null,
};

describe('Director structured contracts', () => {
  it('accepts a bounded decoded-canvas request without image binaries', () => {
    const parsed = DirectorRequestSchema.safeParse({
      message: 'Compile this into a direction and story.',
      model: 'gpt-5.4',
      sessionId: 'director-session-01',
      context: {
        ...emptyContext,
        goal: 'A restrained mythic campaign.',
        exclusions: ['neon'],
        canvas: [{
          id: 'upload-1', assetId: null, title: 'Quiet Warrior', source: 'UPLOAD',
          kind: 'upload', selected: true, inherit: ['emotion', 'framing'], locks: [], decodedSummary: emptySummary,
        }],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unbounded canvas payloads before they reach a provider', () => {
    const canvas = Array.from({ length: 121 }, (_, index) => ({
      id: `upload-${index}`, assetId: null, title: `Reference ${index}`, source: 'UPLOAD' as const,
      kind: 'upload' as const, selected: false, inherit: [], locks: [], decodedSummary: emptySummary,
    }));
    expect(DirectorRequestSchema.safeParse({
      message: 'Compile.', model: 'gpt-5.4-mini', sessionId: 'director-session-02',
      context: { ...emptyContext, canvas },
    }).success).toBe(false);
  });

  it('requires canonical dock modes and executable canvas actions', () => {
    const parsed = DirectorResponseSchema.parse({
      message: 'I will place three matches.', mode: 'inherit', directionContract: null,
      sequence: null, continuity: null,
      canvasActions: [{
        type: 'search_and_add', query: 'warrior', count: 3, objectIds: [], objectId: null,
        channels: ['emotion'], goal: null, exclusions: [],
      }],
      reelActions: [],
      suggestedActions: [],
    });
    expect(parsed.canvasActions[0].type).toBe('search_and_add');
  });

  it('offers only the requested runtime roster and defaults new Director turns to GPT-5.4', () => {
    expect(DirectorModelSchema.options).toEqual(['gpt-5.4', 'gpt-5.4-mini', 'gemini-3.5-flash']);
    const parsed = DirectorRequestSchema.parse({
      message: 'Compile.', sessionId: 'director-session-03', context: emptyContext,
    });
    expect(parsed.model).toBe('gpt-5.4');
  });

  it('keeps provider-rejected bounds out of the Gemini response schema', () => {
    const rejectedKeywords = new Set(['maxItems', 'maxLength', 'maximum', 'minItems', 'minLength', 'minimum']);
    const found: string[] = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      Object.entries(value).forEach(([key, child]) => {
        if (rejectedKeywords.has(key)) found.push(key);
        visit(child);
      });
    };
    visit(DIRECTOR_RESPONSE_JSON_SCHEMA);
    expect(found).toEqual([]);
  });

  it('normalizes fractional provider confidence scores for percentage UI', () => {
    const parsed = DirectorResponseSchema.parse({
      message: 'Direction compiled.', mode: 'combine',
      directionContract: {
        title: 'Gilded Frost', objective: 'Unify warmth and arctic scale.', inheritance: [],
        locks: [], exclusions: [], conflicts: [], coherence: 0.94,
      },
      sequence: null,
      continuity: { score: 0.955, findings: [] },
      canvasActions: [],
      reelActions: [],
      suggestedActions: [],
    });
    expect(parsed.directionContract?.coherence).toBe(94);
    expect(parsed.continuity?.score).toBe(95.5);
  });

  it('accepts retired effect vocabulary at the action boundary for visible local resolution', () => {
    const parsed = DirectorResponseSchema.parse({
      message: 'Applied blur to the selected timeline clips.', mode: 'animate',
      directionContract: null, sequence: null, continuity: null, canvasActions: [],
      reelActions: [{
        type: 'style_clips', objectIds: [], clipIds: ['clip-1'], aspectRatio: null,
        fps: null, quality: null, effect: 'clean', visualEffect: 'blur', transition: 'soft-dissolve',
        motion: 'push-in', duration: 3.2, intensity: 35, caption: null,
      }],
      suggestedActions: ['Render reel'],
    });
    expect(parsed.reelActions[0]).toMatchObject({ effect: 'clean', visualEffect: 'blur', intensity: 35 });
  });

  it('keeps canonical project state separate from the provider compatibility vocabulary', () => {
    expect(ReelVisualEffectSchema.options).toEqual(CANONICAL_REEL_VISUAL_EFFECTS);
    expect(DirectorVisualEffectVocabularySchema.options).toEqual(DIRECTOR_VISUAL_EFFECT_VOCABULARY);
    for (const retired of RETIRED_REEL_VISUAL_EFFECTS) {
      expect(DirectorVisualEffectVocabularySchema.safeParse(retired).success).toBe(true);
      expect(ReelVisualEffectSchema.safeParse(retired).success).toBe(false);
    }
    const project = {
      open: true,
      aspectRatio: '9:16',
      fps: 24,
      quality: 'high',
      selectedClipIds: ['clip-1'],
      clips: [{
        id: 'clip-1', objectId: null, title: 'Legacy', duration: 3.2,
        effect: 'clean', visualEffect: 'rgb-split', transition: 'cut', motion: 'still',
        intensity: 60, caption: '',
      }],
    };
    expect(ReelProjectContextSchema.safeParse(project).success).toBe(false);
    expect(ReelProjectContextSchema.safeParse({
      ...project,
      clips: [{ ...project.clips[0], visualEffect: 'glitch-burst' }],
    }).success).toBe(true);

    const reelItems = (DIRECTOR_RESPONSE_JSON_SCHEMA.properties as {
      reelActions: { items: { properties: { visualEffect: { anyOf: Array<{ enum?: string[] }> } } } };
    }).reelActions.items;
    expect(reelItems.properties.visualEffect.anyOf[0].enum).toEqual(DIRECTOR_VISUAL_EFFECT_VOCABULARY);
  });

  it('accepts only the frame rates the editor can actually execute', () => {
    const baseAction = {
      type: 'set_project', objectIds: [], clipIds: [], aspectRatio: null,
      quality: null, effect: null, visualEffect: null, transition: null, motion: null,
      duration: null, intensity: null, caption: null,
    } as const;
    const response = {
      message: 'Set the project frame rate.', mode: 'animate',
      directionContract: null, sequence: null, continuity: null, canvasActions: [],
      reelActions: [{ ...baseAction, fps: 24 }], suggestedActions: [],
    };

    expect(DirectorResponseSchema.safeParse(response).success).toBe(true);
    expect(DirectorResponseSchema.safeParse({
      ...response,
      reelActions: [{ ...baseAction, fps: 25 }],
    }).success).toBe(false);

    const reelItems = (DIRECTOR_RESPONSE_JSON_SCHEMA.properties as {
      reelActions: { items: { properties: { fps: { anyOf: Array<{ enum?: number[] }> } } } };
    }).reelActions.items;
    expect(reelItems.properties.fps.anyOf[0].enum).toEqual([24, 30]);
  });
});
