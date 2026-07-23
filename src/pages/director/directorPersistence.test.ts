import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveDirectorProject,
  deleteDirectorHistoryProject,
  listDirectorHistory,
  loadActiveDirectorProject,
  loadDirectorHistoryProject,
  makePersistableDirectorProject,
  saveActiveDirectorProject,
} from './directorPersistence';
import type { ReelProject } from './reel/types';
import { EMPTY_SUMMARY, type CanvasObject } from './types';

const remoteObject: CanvasObject = {
  id: 'upload-1',
  title: 'Kinetic Kingdom',
  subtitle: 'Local image',
  kind: 'upload',
  source: 'UPLOAD',
  imageUrl: '/fixtures/kinetic.jpg',
  position: { x: 120, y: 240 },
  inherit: ['palette'],
  locks: [],
  summary: EMPTY_SUMMARY,
};

function projectInput(reelProject: ReelProject | null = null) {
  return {
    sessionId: 'director-session-1',
    objects: [remoteObject],
    selectedIds: [remoteObject.id],
    mode: 'animate' as const,
    goal: 'Build a coherent reel.',
    exclusions: [],
    contract: null,
    sequence: null,
    continuity: null,
    reelProject,
    reelOpen: Boolean(reelProject),
    visibleSearch: null,
    messages: [
      { id: 'welcome', role: 'assistant' as const, text: 'Welcome.' },
      { id: 'user-1', role: 'user' as const, text: 'Make a reel.' },
    ],
    model: 'gpt-5.4' as const,
  };
}

describe('Director local project persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('restores the active canvas and conversation after a reload boundary', () => {
    const project = makePersistableDirectorProject(projectInput());
    expect(project).not.toBeNull();
    if (!project) throw new Error('Expected a persistable project.');
    expect(saveActiveDirectorProject(project)).toBe(true);
    expect(loadActiveDirectorProject()).toMatchObject({
      sessionId: 'director-session-1',
      title: 'Kinetic Kingdom',
      objects: [{ id: 'upload-1', position: { x: 120, y: 240 } }],
      selectedIds: ['upload-1'],
      messages: [{ id: 'welcome' }, { id: 'user-1', text: 'Make a reel.' }],
    });
  });

  it('migrates legacy active and history effects before strict validation and shows one honest receipt', () => {
    const reel: ReelProject = {
      id: 'legacy-reel', title: 'Legacy reel', aspectRatio: '9:16', fps: 24, quality: 'high',
      clips: [{
        id: 'legacy-clip', objectId: 'upload-1', title: 'Legacy portrait',
        imageUrl: '/fixtures/kinetic.jpg', duration: 3.2, effect: 'clean',
        visualEffect: 'glitch-burst', visualEffectStack: ['glitch-burst'], transition: 'cut',
        transitionDuration: 0, motion: 'still', intensity: 60, caption: '',
      }],
      selectedClipIds: ['legacy-clip'], audio: null, renderRequested: false,
    };
    const canonical = makePersistableDirectorProject(projectInput(reel));
    expect(canonical).not.toBeNull();
    if (!canonical?.reelProject) throw new Error('Expected a persisted reel.');
    const legacy = structuredClone(canonical) as unknown as {
      reelProject: { clips: Array<{ visualEffect: string; visualEffectStack: string[] }> };
    };
    legacy.reelProject.clips[0].visualEffect = 'rgb-split';
    legacy.reelProject.clips[0].visualEffectStack = ['rgb-split', 'glow'];

    window.localStorage.setItem('director-open.active-project.v1', JSON.stringify(legacy));
    const restored = loadActiveDirectorProject();
    expect(restored?.reelProject?.clips[0]).toMatchObject({
      visualEffect: 'glitch-burst',
      visualEffectStack: ['glitch-burst'],
    });
    const migrationMessages = restored?.messages.filter((message) => message.label === 'Restored project update') || [];
    expect(migrationMessages).toHaveLength(1);
    expect(migrationMessages[0].text).toContain('RGB split is now Glitch burst.');
    expect(migrationMessages[0].text).toContain('Soft glow was retired; try the HDR look color grade');
    expect(loadActiveDirectorProject()?.messages.filter(
      (message) => message.label === 'Restored project update',
    )).toHaveLength(1);

    window.localStorage.setItem('director-open.project-history.v1', JSON.stringify([{
      id: 'legacy-history',
      project: legacy,
    }]));
    expect(listDirectorHistory()).toHaveLength(1);
    expect(loadDirectorHistoryProject('legacy-history')?.reelProject?.clips[0]).toMatchObject({
      visualEffect: 'glitch-burst',
      visualEffectStack: ['glitch-burst'],
    });
    expect(loadDirectorHistoryProject('legacy-history')?.messages.at(-1)?.text).toContain(
      'Soft glow was retired',
    );
  });

  it('migrates retired OpenAI model aliases in active state and history', () => {
    const canonical = makePersistableDirectorProject(projectInput());
    expect(canonical).not.toBeNull();
    if (!canonical) throw new Error('Expected a persistable project.');

    const legacyActive = { ...structuredClone(canonical), model: 'gpt-5.6-sol' };
    window.localStorage.setItem('director-open.active-project.v1', JSON.stringify(legacyActive));
    expect(loadActiveDirectorProject()?.model).toBe('gpt-5.4');

    const legacyHistory = { ...structuredClone(canonical), model: 'gpt-5.6-terra' };
    window.localStorage.setItem('director-open.project-history.v1', JSON.stringify([{
      id: 'legacy-model-history',
      project: legacyHistory,
    }]));
    expect(listDirectorHistory()).toHaveLength(1);
    expect(loadDirectorHistoryProject('legacy-model-history')?.model).toBe('gpt-5.4-mini');
  });

  it('promotes the legacy Gemini active default once while preserving a later explicit Gemini choice', () => {
    const legacyDefault = makePersistableDirectorProject({
      ...projectInput(),
      model: 'gemini-3.5-flash',
    });
    expect(legacyDefault).not.toBeNull();
    if (!legacyDefault) throw new Error('Expected a persistable project.');
    window.localStorage.setItem('director-open.active-project.v1', JSON.stringify(legacyDefault));

    const promoted = loadActiveDirectorProject();
    expect(promoted?.model).toBe('gpt-5.4');
    if (!promoted) throw new Error('Expected the active project to load.');

    expect(saveActiveDirectorProject({ ...promoted, model: 'gemini-3.5-flash' })).toBe(true);
    expect(loadActiveDirectorProject()?.model).toBe('gemini-3.5-flash');
  });

  it('keeps remote timeline clips while explicitly dropping expired local file handles', () => {
    const localImage = new File(['image'], 'private-concept.png', { type: 'image/png' });
    const localAudio = new File(['audio'], 'private-score.wav', { type: 'audio/wav' });
    const reel: ReelProject = {
      id: 'reel-1', title: 'Recovered reel', aspectRatio: '9:16', fps: 30, quality: 'balanced',
      clips: [
        {
          id: 'clip-remote', objectId: 'upload-1', title: 'Remote', imageUrl: '/fixtures/kinetic.jpg',
          duration: 3, effect: 'cinematic', transition: 'cut', transitionDuration: 0,
          motion: 'push-in', intensity: 62, caption: '',
        },
        {
          id: 'clip-local', objectId: null, title: 'Private', imageUrl: 'blob:https://director.test/private',
          sourceFile: localImage, duration: 3, effect: 'clean', transition: 'crossfade', transitionDuration: 0.4,
          motion: 'still', intensity: 50, caption: '',
        },
      ],
      selectedClipIds: ['clip-local'],
      audio: { name: localAudio.name, url: 'blob:https://director.test/audio', sourceFile: localAudio },
      renderRequested: false,
    };

    const project = makePersistableDirectorProject(projectInput(reel));
    expect(project).not.toBeNull();
    if (!project) throw new Error('Expected a persistable project.');
    expect(project.reelProject?.clips.map((clip) => clip.id)).toEqual(['clip-remote']);
    expect(project.reelProject?.selectedClipIds).toEqual([]);
    expect(project.reelProject?.audio).toBeNull();
    expect(project.localMediaOmitted).toBe(2);
  });

  it('creates bounded recovery snapshots that can be restored and deleted', () => {
    const project = makePersistableDirectorProject(projectInput());
    expect(project).not.toBeNull();
    if (!project) throw new Error('Expected a persistable project.');
    const entries = archiveDirectorProject(project);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: 'Kinetic Kingdom', objectCount: 1, messageCount: 2 });
    expect(loadDirectorHistoryProject(entries[0].id)?.objects[0].title).toBe('Kinetic Kingdom');
    expect(listDirectorHistory()).toHaveLength(1);
    expect(deleteDirectorHistoryProject(entries[0].id)).toEqual([]);
  });

  it('fails closed without crashing when active state exceeds the storage schema', () => {
    const project = makePersistableDirectorProject({
      ...projectInput(),
      goal: 'x'.repeat(1_001),
    });
    expect(project).toBeNull();
  });
});
