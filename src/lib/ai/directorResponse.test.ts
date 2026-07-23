import { describe, expect, it } from 'vitest';
import {
  DIRECTOR_ACTIONS_MARKER,
  DirectorAiResponseError,
  parseDirectorAiResponse,
  splitDirectorActions,
} from './directorResponse';

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
  caption: null,
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
