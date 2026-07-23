import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultWorkspaceLayout,
  loadWorkspaceLayout,
  persistableWorkspaceLayout,
  saveWorkspaceLayout,
  workspaceLayoutReducer,
  type WorkspaceLayoutState,
} from './workspaceLayout';

describe('workspace layout reducer', () => {
  it('defaults to an expanded chat, closed drawer, all sections open', () => {
    const state = defaultWorkspaceLayout();
    expect(state.chatCollapsed).toBe(false);
    expect(state.drawerOpen).toBe(false);
    expect(state.chatUnread).toBe(false);
    expect(state.inspectorSections).toEqual({ output: true, look: true, motion: true, text: true, timing: true });
    expect(state.playerFit).toBe('fit');
  });

  it('toggles chat collapse and clears unread on expand', () => {
    let state = defaultWorkspaceLayout();
    state = workspaceLayoutReducer(state, { type: 'toggle-chat' });
    expect(state.chatCollapsed).toBe(true);
    // Assistant replies while collapsed → unread dot.
    state = workspaceLayoutReducer(state, { type: 'assistant-replied' });
    expect(state.chatUnread).toBe(true);
    // Repeated replies while already-unread are a no-op (same reference).
    expect(workspaceLayoutReducer(state, { type: 'assistant-replied' })).toBe(state);
    // Expanding clears the unread signal.
    state = workspaceLayoutReducer(state, { type: 'toggle-chat' });
    expect(state.chatCollapsed).toBe(false);
    expect(state.chatUnread).toBe(false);
  });

  it('does not accrue unread while the chat is expanded', () => {
    const state = workspaceLayoutReducer(defaultWorkspaceLayout(), { type: 'assistant-replied' });
    expect(state.chatUnread).toBe(false);
  });

  it('opens and closes the drawer idempotently', () => {
    let state = defaultWorkspaceLayout();
    const opened = workspaceLayoutReducer(state, { type: 'open-drawer' });
    expect(opened.drawerOpen).toBe(true);
    // Re-opening returns the same reference (no needless re-render churn).
    expect(workspaceLayoutReducer(opened, { type: 'open-drawer' })).toBe(opened);
    state = workspaceLayoutReducer(opened, { type: 'close-drawer' });
    expect(state.drawerOpen).toBe(false);
    expect(workspaceLayoutReducer(state, { type: 'close-drawer' })).toBe(state);
  });

  it('toggles inspector sections independently', () => {
    let state = defaultWorkspaceLayout();
    state = workspaceLayoutReducer(state, { type: 'toggle-inspector-section', id: 'motion' });
    expect(state.inspectorSections.motion).toBe(false);
    expect(state.inspectorSections.look).toBe(true);
  });

  it('sets player fit without churn', () => {
    const state = defaultWorkspaceLayout();
    expect(workspaceLayoutReducer(state, { type: 'set-player-fit', fit: 'fit' })).toBe(state);
    const filled = workspaceLayoutReducer(state, { type: 'set-player-fit', fit: 'fill' });
    expect(filled.playerFit).toBe('fill');
  });
});

describe('workspace layout persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips only the persistable subset', () => {
    const state: WorkspaceLayoutState = {
      chatCollapsed: true,
      chatUnread: true,
      drawerOpen: true,
      inspectorSections: { output: false, look: true, motion: false, text: true, timing: true },
      playerFit: 'fill',
    };
    expect(persistableWorkspaceLayout(state)).toEqual({
      chatCollapsed: true,
      inspectorSections: { output: false, look: true, motion: false, text: true, timing: true },
      playerFit: 'fill',
    });
    expect(saveWorkspaceLayout(state)).toBe(true);

    const loaded = loadWorkspaceLayout();
    // Persisted fields restore…
    expect(loaded.chatCollapsed).toBe(true);
    expect(loaded.inspectorSections).toEqual({ output: false, look: true, motion: false, text: true, timing: true });
    expect(loaded.playerFit).toBe('fill');
    // …runtime-only fields always start fresh.
    expect(loaded.drawerOpen).toBe(false);
    expect(loaded.chatUnread).toBe(false);
  });

  it('falls back to defaults on corrupt storage', () => {
    window.localStorage.setItem('director-open.workspace.v1', '{ not json');
    expect(loadWorkspaceLayout()).toEqual(defaultWorkspaceLayout());
  });

  it('tolerates partial persisted section maps', () => {
    window.localStorage.setItem(
      'director-open.workspace.v1',
      JSON.stringify({ chatCollapsed: true, inspectorSections: { look: false }, playerFit: 'nonsense' }),
    );
    const loaded = loadWorkspaceLayout();
    expect(loaded.inspectorSections).toEqual({ output: true, look: false, motion: true, text: true, timing: true });
    expect(loaded.playerFit).toBe('fit');
  });
});
