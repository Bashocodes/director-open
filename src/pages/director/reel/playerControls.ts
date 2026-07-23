/**
 * Pure keyboard → player-action mapping for the reel preview. Kept separate from
 * the React component so the interaction contract (Space = play/pause, arrows =
 * scrub, Shift = frame-precise) is unit-testable without a DOM.
 */

export type PlayerAction =
  | { type: 'toggle-play' }
  | { type: 'scrub'; delta: number };

export type PlayerKeyEvent = {
  key: string;
  shiftKey?: boolean;
};

/**
 * Maps a keyboard event to a player action.
 * - Space: toggle play/pause
 * - Left/Right: scrub one second (Shift → one frame)
 * Returns null for keys the player does not handle.
 */
export function keyToPlayerAction(event: PlayerKeyEvent, options: { fps: number }): PlayerAction | null {
  const frame = 1 / Math.max(1, options.fps);
  const step = event.shiftKey ? frame : 1;
  switch (event.key) {
    case ' ':
    case 'Spacebar':
      return { type: 'toggle-play' };
    case 'ArrowLeft':
      return { type: 'scrub', delta: -step };
    case 'ArrowRight':
      return { type: 'scrub', delta: step };
    default:
      return null;
  }
}

/** Clamps a scrub target into the [0, duration] playhead range. */
export function clampPlayhead(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.min(Math.max(0, time), Math.max(0, duration));
}
