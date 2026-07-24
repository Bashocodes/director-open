import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_ACTIONS_MARKER,
  DIRECTOR_SYSTEM_PROMPT,
  DirectorAiResponseError,
  parseDirectorAiResponse,
  splitDirectorActions,
} from './directorResponse';

describe('Director system prompt action surface', () => {
  it('teaches the chat the text-layer verbs and no longer mentions caption', () => {
    for (const verb of ['add_text_layer', 'update_text_layer', 'move_text_layer', 'remove_text_layer']) {
      expect(DIRECTOR_SYSTEM_PROMPT).toContain(verb);
    }
    // The generated JSON schema is the model's only field list; caption is gone.
    expect(DIRECTOR_SYSTEM_PROMPT).not.toContain('caption');
    expect(DIRECTOR_SYSTEM_PROMPT).toContain('sizePreset');
  });
});

const setGoal = {
  type: 'set_goal',
  query: null,
  count: null,
  objectIds: [],
  objectId: null,
  channels: [],
  goal: 'Make the opening more immediate.',
  exclusions: [],
};

const styleClip = {
  type: 'style_clips',
  objectIds: [],
  clipIds: ['clip-1'],
  aspectRatio: null,
  fps: null,
  quality: null,
  effect: 'cinematic',
  visualEffect: null,
  transition: null,
  motion: 'push-in',
  duration: 3,
  intensity: 60,
  layerId: null,
  content: null,
  textX: null,
  textY: null,
  fontId: null,
  sizePreset: null,
  textColor: null,
  align: null,
  inSec: null,
  outSec: null,
};

describe('Director action response parsing', () => {
  it('round-trips validated canvas and reel actions', () => {
    const parsed = parseDirectorAiResponse([
      'Tighten the goal and give the first clip a deliberate push.',
      DIRECTOR_ACTIONS_MARKER,
      JSON.stringify([setGoal, styleClip]),
    ].join('\n'));
    const split = splitDirectorActions(parsed.actions);

    expect(parsed.explanation).toContain('Tighten the goal');
    expect(split.canvasActions).toHaveLength(1);
    expect(split.reelActions).toHaveLength(1);
  });

  it('rejects malformed JSON without producing actions', () => {
    expect(() => parseDirectorAiResponse(`No change yet.\n${DIRECTOR_ACTIONS_MARKER}\n[{`))
      .toThrowError(expect.objectContaining<Partial<DirectorAiResponseError>>({ code: 'malformed-json' }));
  });

  it('rejects schema-invalid actions without producing a partial proposal', () => {
    expect(() => parseDirectorAiResponse([
      'This action is invalid.',
      DIRECTOR_ACTIONS_MARKER,
      JSON.stringify([{ ...setGoal, unknown: true }]),
    ].join('\n'))).toThrowError(
      expect.objectContaining<Partial<DirectorAiResponseError>>({ code: 'schema-invalid' }),
    );
  });
});
