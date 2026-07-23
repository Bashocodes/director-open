import { describe, expect, it } from 'vitest';
import { serializeDirectorContext, type DirectorContextInput } from './directorContext';
import { EMPTY_SUMMARY } from '../../pages/director/types';

const input: DirectorContextInput = {
  mode: 'animate',
  goal: 'Build a restrained portrait reel.',
  exclusions: ['no flashing'],
  objects: [{
    id: 'object-1',
    title: 'private-file-name.png',
    subtitle: 'Local image',
    kind: 'upload',
    source: 'UPLOAD',
    imageUrl: 'blob:https://director.test/private',
    position: { x: 10, y: 20 },
    inherit: ['palette'],
    locks: ['identity'],
    summary: { ...EMPTY_SUMMARY, palette: ['indigo', 'amber'] },
  }],
  selectedIds: ['object-1'],
  contract: {
    title: 'Indigo opening',
    objective: 'Keep the portrait restrained.',
    inheritance: [{
      objectId: 'object-1',
      sourceTitle: 'private-file-name.png',
      channels: ['palette'],
      rationale: 'Use only the palette.',
    }],
    locks: ['identity'],
    exclusions: ['no flashing'],
    conflicts: [],
    coherence: 92,
  },
  sequence: null,
  continuity: null,
  reelProject: {
    id: 'reel-1',
    title: 'Local reel',
    aspectRatio: '9:16',
    fps: 24,
    quality: 'high',
    clips: [{
      id: 'clip-1',
      objectId: 'object-1',
      title: 'private-file-name',
      imageUrl: 'blob:https://director.test/private',
      duration: 3.5,
      effect: 'cinematic',
      gradeStack: ['cinematic'],
      visualEffect: 'none',
      visualEffectStack: [],
      transition: 'crossfade',
      transitionDuration: 0.5,
      motion: 'push-in',
      intensity: 55,
      caption: 'Opening',
    }],
    selectedClipIds: ['clip-1'],
    audio: null,
    renderRequested: false,
  },
  reelOpen: true,
  messages: [],
};

describe('Director canvas context serializer', () => {
  it('is stable, token-budgeted, and excludes local media names and URLs', () => {
    const first = serializeDirectorContext(input, 1_000);
    const second = serializeDirectorContext(structuredClone(input), 1_000);

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(4_000);
    expect(JSON.parse(first)).toMatchObject({
      mode: 'animate',
      reel: {
        aspectRatio: '9:16',
        clips: [{ duration: 3.5, effect: 'cinematic', motion: 'push-in' }],
      },
    });
    expect(first).not.toContain('private-file-name');
    expect(first).not.toContain('blob:');
  });
});
