import type { ReelProject } from './types';

/**
 * Bounded undo/redo for reel editing.
 *
 * Pure data — no React, no timers of its own. The caller supplies the clock so
 * coalescing is testable, and every transition returns a new history object.
 *
 * Entries hold whole project snapshots rather than reverse-diffs. Projects are
 * updated immutably and their media is held by reference (Files and object
 * URLs are shared, never copied), so a snapshot costs one object graph of
 * pointers, not a copy of anyone's images.
 */

export type HistoryEntry = {
  project: ReelProject;
  /**
   * Groups rapid edits of the same thing — dragging one slider should be a
   * single undo, not ninety. `null` never coalesces.
   */
  label: string | null;
  at: number;
};

export type ProjectHistory = {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
};

/** Deep enough to cover a long session, bounded so memory cannot grow without limit. */
export const HISTORY_LIMIT = 60;

/** Successive same-label edits inside this window replace rather than stack. */
export const COALESCE_WINDOW_MS = 700;

export function createHistory(project: ReelProject, at = 0): ProjectHistory {
  return { past: [], present: { project, label: null, at }, future: [] };
}

export function canUndo(history: ProjectHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: ProjectHistory): boolean {
  return history.future.length > 0;
}

/**
 * Records a new state. Returns the same history object when nothing changed,
 * so callers can skip re-rendering.
 */
export function pushHistory(
  history: ProjectHistory,
  project: ReelProject,
  options: { label?: string | null; at?: number } = {},
): ProjectHistory {
  if (project === history.present.project) return history;
  const label = options.label ?? null;
  const at = options.at ?? 0;

  // Same labelled gesture, still in flight: replace the tip so the whole drag
  // undoes in one step. A redo stack cannot survive a new edit either way.
  const coalesces = label !== null
    && history.present.label === label
    && at - history.present.at <= COALESCE_WINDOW_MS;
  if (coalesces) {
    return {
      past: history.past,
      present: { project, label, at },
      future: [],
    };
  }

  const past = [...history.past, history.present];
  return {
    // Drop the oldest entries once the bound is reached.
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: { project, label, at },
    future: [],
  };
}

export function undoHistory(history: ProjectHistory): ProjectHistory {
  if (!canUndo(history)) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory(history: ProjectHistory): ProjectHistory {
  if (!canRedo(history)) return history;
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

/**
 * A label for a clip edit, derived from what is being changed. Editing the same
 * fields of the same clips repeatedly is one gesture; touching a different
 * field or a different clip starts a new one.
 */
export function clipEditLabel(clipIds: readonly string[], patchKeys: readonly string[]): string {
  return `clip:${[...clipIds].sort().join('+')}:${[...patchKeys].sort().join(',')}`;
}
