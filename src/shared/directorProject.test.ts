import { describe, expect, it } from 'vitest';
import {
  createDirectorLocalMediaReference,
  DirectorProjectFileError,
  DirectorProjectFileSchema,
  isDirectorLocalMediaReference,
  MAX_DIRECTOR_PROJECT_JSON_BYTES,
  migrateDirectorProjectValue,
  parseDirectorLocalMediaReference,
  parseDirectorProjectJson,
  safeParseDirectorProjectFile,
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
    version: 2,
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
        textLayers: [],
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

function legacyV1Project(caption: string): Record<string, unknown> {
  return {
    version: 1,
    sessionId: 'legacy-session-1',
    updatedAt: '2026-01-02T03:04:05.000Z',
    title: 'Legacy caption reel',
    objects: [],
    selectedIds: [],
    mode: 'animate',
    goal: '',
    exclusions: [],
    contract: null,
    sequence: null,
    continuity: null,
    reelProject: {
      id: 'reel-legacy',
      title: 'Legacy caption reel',
      aspectRatio: '9:16',
      fps: 30,
      quality: 'balanced',
      clips: [{
        id: 'legacy-clip',
        objectId: null,
        title: 'Frame',
        imageUrl: 'local-media:clip:legacy-clip',
        duration: 4,
        effect: 'clean',
        visualEffect: 'none',
        transition: 'cut',
        transitionDuration: 0,
        motion: 'still',
        intensity: 50,
        caption,
      }],
      selectedClipIds: ['legacy-clip'],
      audio: null,
      renderRequested: false,
    },
    reelOpen: true,
    visibleSearch: null,
    messages: [],
    model: 'gpt-5.4',
    localMediaOmitted: 1,
  };
}

describe('Director project text-layer migration (v1 → v2)', () => {
  it('converts a legacy caption into one bottom-centered text layer and bumps the version', () => {
    const migrated = migrateDirectorProjectValue(legacyV1Project('Quiet Resolve')) as {
      version: number;
      reelProject: { clips: Array<Record<string, unknown> & { textLayers: Array<Record<string, unknown>> }> };
    };
    expect(migrated.version).toBe(2);
    const clip = migrated.reelProject.clips[0];
    expect(clip).not.toHaveProperty('caption');
    expect(clip.textLayers).toHaveLength(1);
    expect(clip.textLayers[0]).toMatchObject({
      content: 'Quiet Resolve',
      anchor: 'bottom-center',
      timing: { inSec: 0, outSec: 4 },
    });
    // The migrated shape passes strict validation.
    expect(safeParseDirectorProjectFile(legacyV1Project('Quiet Resolve')).success).toBe(true);
  });

  it('leaves an empty caption as an empty text-layer array', () => {
    const migrated = migrateDirectorProjectValue(legacyV1Project('   ')) as {
      reelProject: { clips: Array<{ textLayers: unknown[] }> };
    };
    expect(migrated.reelProject.clips[0].textLayers).toEqual([]);
  });

  it('is idempotent — never re-migrates an already-v2 project into duplicate layers', () => {
    const once = migrateDirectorProjectValue(legacyV1Project('Once')) as { version: number };
    const twice = migrateDirectorProjectValue(once) as {
      version: number;
      reelProject: { clips: Array<{ textLayers: unknown[] }> };
    };
    expect(twice.version).toBe(2);
    expect(twice.reelProject.clips[0].textLayers).toHaveLength(1);
  });
});

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
