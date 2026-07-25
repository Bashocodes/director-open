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
