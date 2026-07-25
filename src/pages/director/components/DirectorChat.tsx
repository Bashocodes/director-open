import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Bot,
  Check,
  Database,
  Download,
  HardDrive,
  History,
  KeyRound,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  describeDirectorAction,
  type DirectorAiProposal,
} from '../../../lib/ai/directorResponse';
import { isProviderConfigured, type AiSettings } from '../../../lib/ai/vault';
import type { ChatProviderId } from '../../../lib/ai/types';
import type { DirectorHistorySummary } from '../directorPersistence';
import type { ChatTurn } from '../types';
import { AiSettingsPanel } from './AiSettingsPanel';
import { DirectorArtifact } from './DirectorArtifact';

type Props = {
  collapsed: boolean;
  unread: boolean;
  onToggleCollapse: () => void;
  messages: ChatTurn[];
  busy: boolean;
  selectedCount: number;
  objectCount: number;
  referenceCount: number;
  hasContract: boolean;
  hasSequence: boolean;
  hasReel: boolean;
  reelOpen: boolean;
  aiSettings: AiSettings;
  pendingProposal: DirectorAiProposal | null;
  history: DirectorHistorySummary[];
  historyOpen: boolean;
  persistenceStatus: 'saving' | 'saved' | 'quota' | 'unavailable';
  projectFileNotice: string;
  onAiSettingsChange: (settings: AiSettings) => void;
  onApplyProposal: () => void;
  onDiscardProposal: () => void;
  onSend: (text: string, label?: string) => void;
  onNewProject: () => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
  onToggleHistory: () => void;
  onRestoreHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
};

const quickActions = [
  ['Compile direction', 'Compile the selected visual ingredients into one Direction brief. Resolve conflicts and preserve my locks and exclusions.'],
  ['Build visual story', 'Turn the approved Direction brief into a six-beat visual story with emotional progression, camera decisions, motion, and continuity locks.'],
  ['Check drift', 'Validate the current sequence for identity, silhouette, palette, lighting, material, and world drift. Repair only what is inconsistent.'],
  ['Make reel', 'Open Reel Studio and turn the selected visual references into a polished vertical reel. Use cinematic grading, varied camera motion, restrained crossfades, and a coherent pace.'],
  ['Render reel', 'Prepare the current reel for a high-quality local MP4 render on this device.'],
] as const;

const PROVIDER_LABELS: Record<ChatProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Gemini',
  custom: 'Custom / local',
};

export function DirectorChat(props: Props) {
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const projectInputRef = useRef<HTMLInputElement | null>(null);
  const configured = isProviderConfigured(props.aiSettings);
  const provider = props.aiSettings.selectedProvider;
  const model = props.aiSettings.providers[provider].model;

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [props.messages, props.busy]);

  function submit() {
    const value = input.trim();
    if (!value || props.busy || !configured || props.pendingProposal) return;
    setInput('');
    props.onSend(value);
  }

  function historyDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Saved project' : new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(date);
  }

  if (props.collapsed) {
    return (
      <aside className="director-chat collapsed" aria-label="Director Visual Expert (collapsed)">
        <button
          type="button"
          className="chat-rail"
          onClick={props.onToggleCollapse}
          title="Expand Director chat (⌘/Ctrl + \)"
          aria-label="Expand Director chat"
        >
          <span className="chat-rail-icon">
            <Sparkles size={16} />
            {props.unread && <i className="chat-rail-unread" aria-hidden="true" />}
          </span>
          <span className="chat-rail-label">Director</span>
          <span className="chat-rail-expand"><PanelRightOpen size={16} /></span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="director-chat" aria-label="Director Visual Expert">
      <header className="chat-head">
        <div className="chat-logo"><Sparkles size={16} /></div>
        <div>
          <span className="eyebrow">DIRECTOR · VISUAL EXPERT</span>
          <h2>Creative Director + Storyteller</h2>
          <p>Sees the canvas state · remembers the active Direction brief</p>
        </div>
        <div className="chat-head-actions">
          <button
            type="button"
            className={settingsOpen ? 'active' : ''}
            title="AI provider settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          ><Settings2 size={15} /></button>
          <button
            type="button"
            title="Export project JSON"
            aria-label="Export project JSON"
            onClick={props.onExportProject}
          ><Download size={15} /></button>
          <button
            type="button"
            title="Import project JSON"
            aria-label="Import project JSON"
            onClick={() => projectInputRef.current?.click()}
          ><Upload size={15} /></button>
          <input
            ref={projectInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Project JSON file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) props.onImportProject(file);
              event.target.value = '';
            }}
          />
          <button type="button" className="new-project-button" title="Start a new Director project" onClick={props.onNewProject}><Plus size={16} /><span>New project</span></button>
          <button type="button" className={props.historyOpen ? 'active' : ''} title="Project history" aria-expanded={props.historyOpen} onClick={props.onToggleHistory}><History size={15} /></button>
          <button type="button" title="Collapse Director chat (⌘/Ctrl + \)" aria-label="Collapse Director chat" onClick={props.onToggleCollapse}><PanelRightClose size={15} /></button>
        </div>
      </header>

      {settingsOpen && (
        <AiSettingsPanel
          settings={props.aiSettings}
          onChange={props.onAiSettingsChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {props.historyOpen && (
        <section className="project-history-panel" aria-label="Director project history">
          <header><div><History size={13} /><strong>Project history</strong></div><span>Saved on this browser</span></header>
          <div className="project-history-list">
            {props.history.length ? props.history.map((item) => (
              <article key={item.id}>
                <button type="button" className="history-restore" onClick={() => props.onRestoreHistory(item.id)}>
                  <strong>{item.title}</strong>
                  <span>{historyDate(item.updatedAt)} · {item.objectCount} objects · {item.messageCount} turns</span>
                </button>
                <button type="button" className="history-delete" title={`Delete ${item.title} from history`} onClick={() => props.onDeleteHistory(item.id)}><Trash2 size={12} /></button>
              </article>
            )) : <p>No saved project versions yet. Director creates a recovery point after each completed turn.</p>}
          </div>
        </section>
      )}

      <div className="context-ribbon">
        <span><Database size={11} /> {props.objectCount} canvas objects</span>
        <span>{props.selectedCount} selected now</span>
        <span>{props.reelOpen ? 'reel timeline: active' : props.hasReel ? 'reel timeline: ready' : 'decoded context: all'}</span>
        <span
          className={`persistence-state ${props.persistenceStatus}`}
          role={props.persistenceStatus === 'quota' ? 'alert' : undefined}
          title={props.persistenceStatus === 'quota'
            ? 'Browser storage is full. Remove media or free browser storage; the latest project media was not saved.'
            : undefined}
        >
          <HardDrive size={10} /> {props.persistenceStatus === 'saving'
            ? 'saving…'
            : props.persistenceStatus === 'saved'
              ? 'saved locally'
              : props.persistenceStatus === 'quota'
                ? 'storage full · media not saved'
                : 'save unavailable'}
        </span>
      </div>
      {props.projectFileNotice && (
        <div className="project-file-notice" role="status">{props.projectFileNotice}</div>
      )}

      <div className="chat-stream" ref={streamRef}>
        {props.messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role} ${message.error ? 'error' : ''}`}>
            {message.role === 'assistant' && <span className="message-avatar"><Bot size={12} /></span>}
            <div className="message-content">
              {message.label && <span className="message-label">{message.label}</span>}
              <p>{message.text}</p>
              {message.response && <DirectorArtifact response={message.response} />}
              {message.response?.suggestedActions.length ? (
                <div className="followup-chips">
                  {message.response.suggestedActions.map((action) => (
                    <button key={action} type="button" disabled={props.busy} onClick={() => props.onSend(action, action)}>{action}</button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {props.pendingProposal && (
          <article className="ai-proposal-card" aria-label="Apply these edits">
            <header><Sparkles size={13} /><strong>Apply these edits</strong></header>
            {props.pendingProposal.actions.length ? (
              <ol>
                {props.pendingProposal.actions.map((action, index) => (
                  <li key={`${action.type}-${index}`}>{describeDirectorAction(action)}</li>
                ))}
              </ol>
            ) : <p>No canvas or reel changes were proposed.</p>}
            <footer>
              <button type="button" className="discard-proposal" onClick={props.onDiscardProposal}><X size={12} /> Discard</button>
              <button
                type="button"
                className="apply-proposal"
                disabled={!props.pendingProposal.actions.length}
                onClick={props.onApplyProposal}
              ><Check size={12} /> Apply</button>
            </footer>
          </article>
        )}
        {props.busy && (
          <div className="chat-message assistant thinking">
            <span className="message-avatar"><Bot size={12} /></span>
            <div className="thinking-orbit"><i /><i /><i /></div>
          </div>
        )}
      </div>

      <div className="chat-composer-wrap">
        {!configured && (
          <div className="ai-setup-state">
            <KeyRound size={15} />
            <div><strong>Set up an AI provider</strong><span>The editor works without AI. Add a browser-only key when you want canvas-aware suggestions.</span></div>
            <button type="button" onClick={() => setSettingsOpen(true)}>Open settings</button>
          </div>
        )}
        <div className="quick-actions">
          {quickActions.map(([label, prompt]) => (
            <button
              key={label}
              type="button"
              disabled={props.busy || !configured || Boolean(props.pendingProposal)
                || (label === 'Compile direction' && props.referenceCount < 2)
                || (label === 'Build visual story' && !props.hasContract)
                || (label === 'Check drift' && !props.hasSequence)
                || (label === 'Make reel' && props.referenceCount < 1)
                || (label === 'Render reel' && !props.hasReel)}
              title={label === 'Compile direction' && props.referenceCount < 2
                ? 'Add at least two references first'
                : label === 'Build visual story' && !props.hasContract
                  ? 'Compile a Direction brief first'
                  : label === 'Check drift' && !props.hasSequence
                    ? 'Build a visual story first'
                    : label === 'Make reel' && props.referenceCount < 1
                      ? 'Add at least one visual reference first'
                      : label === 'Render reel' && !props.hasReel
                        ? 'Create a reel timeline first'
                    : undefined}
              onClick={() => props.onSend(prompt, label)}
            >{label}</button>
          ))}
        </div>
        <div className="chat-composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Ask for a direction, reel, blur, grade, motion, transition, timing, or render…"
            disabled={!configured || Boolean(props.pendingProposal)}
            rows={3}
          />
          <div className="composer-footer">
            <select
              value={provider}
              onChange={(event) => props.onAiSettingsChange({
                ...props.aiSettings,
                selectedProvider: event.target.value as ChatProviderId,
              })}
              aria-label="AI provider"
            >
              {(Object.keys(PROVIDER_LABELS) as ChatProviderId[]).map((id) => (
                <option key={id} value={id}>{PROVIDER_LABELS[id]}</option>
              ))}
            </select>
            <span className={`provider-status ${configured ? 'configured' : 'unconfigured'}`} title={model}>
              {configured ? `${model} · browser direct` : 'AI SETUP NEEDED'}
            </span>
            <span className="privacy-note">media renders locally</span>
            <button
              className="send-button"
              type="button"
              onClick={submit}
              disabled={props.busy || !configured || Boolean(props.pendingProposal) || !input.trim()}
            >
              <span>Send</span><ArrowUp size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
