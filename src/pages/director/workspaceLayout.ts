/**
 * Workspace layout state — the single place that models the Director shell's
 * intentional zones and their transient surfaces (collapsible chat, media
 * drawer, inspector sections, player fit). This is UI chrome, deliberately kept
 * OUT of the Zod-validated, privacy-bounded, portable project schema.
 *
 * The persisted subset lives in its own `director-open.workspace.v1` localStorage
 * key so nothing here leaks into project JSON or model/Worker context.
 */

export type InspectorSectionId = 'output' | 'look' | 'motion' | 'text' | 'timing';

export const INSPECTOR_SECTION_IDS: InspectorSectionId[] = ['output', 'look', 'motion', 'text', 'timing'];

export type PlayerFit = 'fit' | 'fill';

export type WorkspaceLayoutState = {
  /** Chat panel collapsed to the slim rail. Persisted. */
  chatCollapsed: boolean;
  /** Assistant replied while the chat was collapsed. Runtime only. */
  chatUnread: boolean;
  /** Media drawer slide-over is open. Runtime only — always starts closed. */
  drawerOpen: boolean;
  /** Open/closed state of each inspector section. Persisted. */
  inspectorSections: Record<InspectorSectionId, boolean>;
  /** Preview fit ('contain') vs fill ('cover'). Persisted. */
  playerFit: PlayerFit;
};

export type WorkspaceLayoutAction =
  | { type: 'toggle-chat' }
  | { type: 'set-chat-collapsed'; collapsed: boolean }
  | { type: 'assistant-replied' }
  | { type: 'open-drawer' }
  | { type: 'close-drawer' }
  | { type: 'toggle-inspector-section'; id: InspectorSectionId }
  | { type: 'set-player-fit'; fit: PlayerFit };

const STORAGE_KEY = 'director-open.workspace.v1';

function defaultInspectorSections(): Record<InspectorSectionId, boolean> {
  return { output: true, look: true, motion: true, text: true, timing: true };
}

/** New-user defaults: chat expanded, drawer closed, all sections open, fit. */
export function defaultWorkspaceLayout(): WorkspaceLayoutState {
  return {
    chatCollapsed: false,
    chatUnread: false,
    drawerOpen: false,
    inspectorSections: defaultInspectorSections(),
    playerFit: 'fit',
  };
}

export function workspaceLayoutReducer(
  state: WorkspaceLayoutState,
  action: WorkspaceLayoutAction,
): WorkspaceLayoutState {
  switch (action.type) {
    case 'toggle-chat': {
      const chatCollapsed = !state.chatCollapsed;
      // Expanding always clears the unread signal.
      return { ...state, chatCollapsed, chatUnread: chatCollapsed ? state.chatUnread : false };
    }
    case 'set-chat-collapsed':
      return {
        ...state,
        chatCollapsed: action.collapsed,
        chatUnread: action.collapsed ? state.chatUnread : false,
      };
    case 'assistant-replied':
      // Only a collapsed panel accrues unread; idempotent so streaming deltas
      // don't churn state once the dot is already lit.
      return state.chatCollapsed && !state.chatUnread ? { ...state, chatUnread: true } : state;
    case 'open-drawer':
      return state.drawerOpen ? state : { ...state, drawerOpen: true };
    case 'close-drawer':
      return state.drawerOpen ? { ...state, drawerOpen: false } : state;
    case 'toggle-inspector-section':
      return {
        ...state,
        inspectorSections: {
          ...state.inspectorSections,
          [action.id]: !state.inspectorSections[action.id],
        },
      };
    case 'set-player-fit':
      return state.playerFit === action.fit ? state : { ...state, playerFit: action.fit };
    default:
      return state;
  }
}

type PersistedWorkspaceLayout = Pick<
  WorkspaceLayoutState,
  'chatCollapsed' | 'inspectorSections' | 'playerFit'
>;

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function persistableWorkspaceLayout(state: WorkspaceLayoutState): PersistedWorkspaceLayout {
  return {
    chatCollapsed: state.chatCollapsed,
    inspectorSections: state.inspectorSections,
    playerFit: state.playerFit,
  };
}

/** Loads and validates the persisted subset, merged onto fresh runtime defaults. */
export function loadWorkspaceLayout(): WorkspaceLayoutState {
  const base = defaultWorkspaceLayout();
  const local = storage();
  if (!local) return base;
  let raw: unknown;
  try {
    raw = JSON.parse(local.getItem(STORAGE_KEY) || 'null');
  } catch {
    return base;
  }
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Record<string, unknown>;
  const sections = defaultInspectorSections();
  if (value.inspectorSections && typeof value.inspectorSections === 'object') {
    for (const id of INSPECTOR_SECTION_IDS) {
      const stored = (value.inspectorSections as Record<string, unknown>)[id];
      if (typeof stored === 'boolean') sections[id] = stored;
    }
  }
  return {
    ...base,
    chatCollapsed: typeof value.chatCollapsed === 'boolean' ? value.chatCollapsed : base.chatCollapsed,
    inspectorSections: sections,
    playerFit: value.playerFit === 'fill' ? 'fill' : 'fit',
  };
}

export function saveWorkspaceLayout(state: WorkspaceLayoutState): boolean {
  const local = storage();
  if (!local) return false;
  try {
    local.setItem(STORAGE_KEY, JSON.stringify(persistableWorkspaceLayout(state)));
    return true;
  } catch {
    return false;
  }
}
