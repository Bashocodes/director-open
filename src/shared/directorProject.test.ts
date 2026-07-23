import { describe, expect, it } from 'vitest';
import {
  createDirectorLocalMediaReference,
  DirectorProjectFileError,
  DirectorProjectFileSchema,
  isDirectorLocalMediaReference,
  MAX_DIRECTOR_PROJECT_JSON_BYTES,
  parseDirectorLocalMediaReference,
  parseDirectorProjectJson,
  stringifyDirectorProjectFile,
  type DirectorProjectFile,
} from './directorProject';

const emptySummary = {
  emotion: [],
  materials: [],
  composition: [],
  palette: [],
  lighting: [],
  camera: [],
  world: [],
  style: [],
  subjects: [],
};

function fixtureProject(): DirectorProjectFile {
  return DirectorProjectFileSchema.parse({
    version: 1,
    sessionId: 'fixture-session-1',
    updatedAt: '2026-01-02T03:04:05.000Z',
    title: 'Fixture project',
    objects: [{
      id: 'object-1',
      title: 'Local image',
      subtitle: 'Imported locally',
      kind: 'upload',
      source: 'UPLOAD',
      imageUrl: createDirectorLocalMediaReference('object', 'object-1'),
      position: { x: 10, y: 20 },
      inherit: [],
      locks: [],
      summary: emptySummary,
    }],
    selectedIds: ['object-1'],
    mode: 'animate',
    goal: 'Build a concise reel.',
    exclusions: ['no flashing'],
    contract: null,
    sequence: null,
    continuity: null,
    reelProject: {
      id: 'reel-1',
      title: 'Fixture reel',
      aspectRatio: '9:16',
      fps: 30,
      quality: 'high',
      clips: [{
        id: 'clip-1',
        objectId: 'object-1',
        title: 'Opening',
        imageUrl: createDirectorLocalMediaReference('clip', 'clip-1'),
        duration: 3,
        effect: 'clean',
        visualEffect: 'none',
        transition: 'cut',
        transitionDuration: 0,
        motion: 'still',
        intensity: 60,
        caption: '',
      }],
      selectedClipIds: ['clip-1'],
      audio: null,
      renderRequested: false,
    },
    reelOpen: true,
    visibleSearch: null,
    messages: [],
    model: 'gpt-5.4',
    localMediaOmitted: 2,
  });
}

describe('Director project-file contract', () => {
  it('round-trips canonical JSON without dropping local-media placeholders', () => {
    const project = fixtureProject();
    const json = stringifyDirectorProjectFile(project);
    const restored = parseDirectorProjectJson(json);

    expect(restored).toEqual(project);
    expect(restored.objects[0].imageUrl).toBe('local-media:object:object-1');
    expect(restored.reelProject?.clips[0].imageUrl).toBe('local-media:clip:clip-1');
    expect(json.endsWith('\n')).toBe(true);
  });

  it('migrates retired effect and model aliases before strict validation', () => {
    const legacy = structuredClone(fixtureProject()) as unknown as {
      model: string;
      reelProject: { clips: Array<{ visualEffect: string; visualEffectStack?: string[] }> };
    };
    legacy.model = 'gpt-5.6-sol';
    legacy.reelProject.clips[0].visualEffect = 'rgb-split';
    legacy.reelProject.clips[0].visualEffectStack = ['rgb-split', 'glow'];

    const restored = parseDirectorProjectJson(JSON.stringify(legacy));
    expect(restored.model).toBe('gpt-5.4');
    expect(restored.reelProject?.clips[0]).toMatchObject({
      visualEffect: 'glitch-burst',
      visualEffectStack: ['glitch-burst'],
    });
    expect(restored.messages.at(-1)?.text).toContain('RGB split is now Glitch burst.');
  });

  it('rejects malformed, schema-invalid, and oversized JSON with stable codes', () => {
    expect(() => parseDirectorProjectJson('{')).toThrowError(
      expect.objectContaining<Partial<DirectorProjectFileError>>({ code: 'malformed_json' }),
    );
    expect(() => parseDirectorProjectJson('{}')).toThrowError(
      expect.objectContaining<Partial<DirectorProjectFileError>>({ code: 'schema_invalid' }),
    );
    expect(() => parseDirectorProjectJson('x'.repeat(MAX_DIRECTOR_PROJECT_JSON_BYTES + 1)))
      .toThrowError(
        expect.objectContaining<Partial<DirectorProjectFileError>>({ code: 'json_too_large' }),
      );
  });

  it('creates and parses encoded local-media references without accepting lookalikes', () => {
    const reference = createDirectorLocalMediaReference('object', 'image / one');
    expect(reference).toBe('local-media:object:image%20%2F%20one');
    expect(parseDirectorLocalMediaReference(reference)).toEqual({
      target: 'object',
      id: 'image / one',
    });
    expect(isDirectorLocalMediaReference(reference, 'object')).toBe(true);
    expect(isDirectorLocalMediaReference(reference, 'clip')).toBe(false);
    expect(parseDirectorLocalMediaReference('local-media:remote:x')).toBeNull();
  });
});
