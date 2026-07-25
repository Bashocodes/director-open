import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  clipEditLabel,
  COALESCE_WINDOW_MS,
  createHistory,
  HISTORY_LIMIT,
  pushHistory,
  redoHistory,
  rehydrateProjectMedia,
  undoHistory,
} from './projectHistory';
import type { ReelProject } from './types';

function project(title: string): ReelProject {
  return {
    id: 'reel-1',
    title,
    aspectRatio: '9:16',
    fps: 30,
    quality: 'balanced',
    clips: [],
    selectedClipIds: [],
    audio: null,
    renderRequested: false,
  };
}

describe('createHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const history = createHistory(project('a'));
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(history.present.project.title).toBe('a');
  });
});

describe('pushHistory', () => {
  it('records a new state and makes it undoable', () => {
    const history = pushHistory(createHistory(project('a')), project('b'));
    expect(canUndo(history)).toBe(true);
    expect(history.present.project.title).toBe('b');
  });

  it('ignores a push of the identical project object', () => {
    const start = project('a');
    const history = createHistory(start);
    expect(pushHistory(history, start)).toBe(history);
  });

  it('drops the redo stack once a new edit lands', () => {
    let history = pushHistory(createHistory(project('a')), project('b'));
    history = undoHistory(history);
    expect(canRedo(history)).toBe(true);
    history = pushHistory(history, project('c'));
    expect(canRedo(history)).toBe(false);
    expect(history.present.project.title).toBe('c');
  });

  it('bounds how far back it remembers', () => {
    let history = createHistory(project('0'));
    for (let i = 1; i <= HISTORY_LIMIT + 25; i += 1) {
      history = pushHistory(history, project(String(i)));
    }
    expect(history.past.length).toBe(HISTORY_LIMIT);
    // The tip is still correct after trimming.
    expect(history.present.project.title).toBe(String(HISTORY_LIMIT + 25));
  });
});

describe('coalescing', () => {
  it('collapses a rapid same-label gesture into one undo step', () => {
    let history = createHistory(project('start'), 0);
    history = pushHistory(history, project('drag-1'), { label: 'intensity', at: 100 });
    history = pushHistory(history, project('drag-2'), { label: 'intensity', at: 200 });
    history = pushHistory(history, project('drag-3'), { label: 'intensity', at: 300 });
    expect(history.past.length).toBe(1);
    history = undoHistory(history);
    // One undo returns to before the whole drag, not to the middle of it.
    expect(history.present.project.title).toBe('start');
  });

  it('starts a new step once the gesture goes quiet', () => {
    let history = createHistory(project('start'), 0);
    history = pushHistory(history, project('a'), { label: 'intensity', at: 100 });
    history = pushHistory(history, project('b'), {
      label: 'intensity',
      at: 100 + COALESCE_WINDOW_MS + 1,
    });
    expect(history.past.length).toBe(2);
  });

  it('does not merge different labels however fast they arrive', () => {
    let history = createHistory(project('start'), 0);
    history = pushHistory(history, project('a'), { label: 'intensity', at: 10 });
    history = pushHistory(history, project('b'), { label: 'duration', at: 12 });
    expect(history.past.length).toBe(2);
  });

  it('never merges unlabelled edits', () => {
    let history = createHistory(project('start'), 0);
    history = pushHistory(history, project('a'), { at: 10 });
    history = pushHistory(history, project('b'), { at: 12 });
    expect(history.past.length).toBe(2);
  });
});

describe('undo and redo', () => {
  it('walks backwards and forwards through the same states', () => {
    let history = createHistory(project('a'));
    history = pushHistory(history, project('b'));
    history = pushHistory(history, project('c'));

    history = undoHistory(history);
    expect(history.present.project.title).toBe('b');
    history = undoHistory(history);
    expect(history.present.project.title).toBe('a');
    expect(canUndo(history)).toBe(false);

    history = redoHistory(history);
    expect(history.present.project.title).toBe('b');
    history = redoHistory(history);
    expect(history.present.project.title).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('is a no-op at each end', () => {
    const start = createHistory(project('a'));
    expect(undoHistory(start)).toBe(start);
    expect(redoHistory(start)).toBe(start);
  });

  it('restores the exact project object, so shared media survives', () => {
    const original = project('a');
    let history = createHistory(original);
    history = pushHistory(history, project('b'));
    history = undoHistory(history);
    // Identity, not a clone: object URLs and Files must be the same references.
    expect(history.present.project).toBe(original);
  });
});

describe('rehydrateProjectMedia', () => {
  function file(name: string) {
    return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
  }

  function withClip(sourceFile: File | undefined, imageUrl: string): ReelProject {
    return {
      ...project('reel'),
      clips: [{
        id: 'clip-1',
        objectId: null,
        title: 'Clip',
        imageUrl,
        sourceFile,
        duration: 3.2,
        effect: 'clean',
        visualEffect: 'none',
        transition: 'cut',
        transitionDuration: 0,
        motion: 'push-in',
        intensity: 60,
        textLayers: [],
      }],
    };
  }

  it('replaces the URL of a clip whose media was revoked', () => {
    /*
     * The real failure: deleting a clip revokes its object URL, so undoing the
     * deletion restored a clip whose image could no longer load.
     */
    const source = file('a.jpg');
    const minted: string[] = [];
    const result = rehydrateProjectMedia(
      withClip(source, 'blob:revoked'),
      new Map(),
      (f) => { const url = `blob:fresh-${f.name}`; minted.push(url); return url; },
    );
    expect(result.clips[0].imageUrl).toBe('blob:fresh-a.jpg');
    expect(minted).toHaveLength(1);
  });

  it('mints one URL per File however far you travel', () => {
    const source = file('a.jpg');
    const cache = new Map<File, string>();
    let calls = 0;
    const create = (f: File) => { calls += 1; return `blob:fresh-${f.name}-${calls}`; };
    const first = rehydrateProjectMedia(withClip(source, 'blob:revoked'), cache, create);
    const second = rehydrateProjectMedia(withClip(source, 'blob:revoked'), cache, create);
    expect(calls).toBe(1);
    expect(second.clips[0].imageUrl).toBe(first.clips[0].imageUrl);
  });

  it('leaves clips with no source File untouched', () => {
    // Restored-from-storage clips are never revoked by the removal path, and
    // there is no File to mint a replacement from.
    const input = withClip(undefined, 'blob:restored');
    const result = rehydrateProjectMedia(input, new Map(), () => 'blob:should-not-be-used');
    expect(result).toBe(input);
    expect(result.clips[0].imageUrl).toBe('blob:restored');
  });

  it('rehydrates audio as well as clips', () => {
    const audioFile = file('track.mp3');
    const input: ReelProject = {
      ...withClip(undefined, 'blob:restored'),
      audio: { name: 'track.mp3', url: 'blob:revoked-audio', sourceFile: audioFile },
    };
    const result = rehydrateProjectMedia(input, new Map(), (f) => `blob:fresh-${f.name}`);
    expect(result.audio?.url).toBe('blob:fresh-track.mp3');
  });

  it('returns the same object when nothing needed replacing', () => {
    const source = file('a.jpg');
    const cache = new Map<File, string>([[source, 'blob:live']]);
    const input = withClip(source, 'blob:live');
    expect(rehydrateProjectMedia(input, cache, () => 'blob:unused')).toBe(input);
  });
});

describe('clipEditLabel', () => {
  it('is stable regardless of clip or key order', () => {
    expect(clipEditLabel(['b', 'a'], ['y', 'x']))
      .toBe(clipEditLabel(['a', 'b'], ['x', 'y']));
  });

  it('separates different fields and different clips', () => {
    expect(clipEditLabel(['a'], ['intensity'])).not.toBe(clipEditLabel(['a'], ['duration']));
    expect(clipEditLabel(['a'], ['intensity'])).not.toBe(clipEditLabel(['b'], ['intensity']));
  });
});
