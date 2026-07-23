import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, Database, HardDrive, History, Plus, Sparkles, Trash2 } from 'lucide-react';
import { DIRECTOR_MODELS, type DirectorModel } from '../../../shared/directorSchemas';
import type { DirectorHistorySummary } from '../directorPersistence';
import type { ChatTurn } from '../types';
import { DirectorArtifact } from './DirectorArtifact';

type Props = {
  messages: ChatTurn[];
  busy: boolean;
  selectedCount: number;
  objectCount: number;
  referenceCount: number;
  hasContract: boolean;
  hasSequence: boolean;
  hasReel: boolean;
  reelOpen: boolean;
  model: DirectorModel;
  history: DirectorHistorySummary[];
  historyOpen: boolean;
  persistenceStatus: 'saving' | 'saved' | 'unavailable';
  providerStatus: {
    mode: 'checking' | 'gemini' | 'openai' | 'demo' | 'unconfigured';
    geminiConfigured: boolean;
    openaiConfigured: boolean;
    demoEnabled: boolean;
  };
  onModelChange: (model: DirectorModel) => void;
  onSend: (text: string, label?: string) => void;
  onNewProject: () => void;
  onToggleHistory: () => void;
  onRestoreHistory: (id: string) => void;
  onDeleteHistory: (id: string) => void;
};

const quickActions = [
  ['Compile direction', 'Compile the selected visual ingredients into one Direction Contract. Resolve conflicts and preserve my locks and exclusions.'],
  ['Build visual story', 'Turn the approved Direction Contract into a six-beat visual story with emotional progression, camera decisions, motion, and continuity locks.'],
  ['Check drift', 'Validate the current sequence for identity, silhouette, palette, lighting, material, and world drift. Repair only what is inconsistent.'],
  ['Make reel', 'Open Reel Studio and turn the selected visual references into a polished vertical reel. Use cinematic grading, varied camera motion, restrained crossfades, and a coherent pace.'],
  ['Render reel', 'Prepare the current reel for a high-quality local MP4 render on this device.'],
] as const;

const DIRECTOR_MODEL_LABELS: Record<DirectorModel, string> = {
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 MINI',
  'gemini-3.5-flash': 'GEMINI 3.5 FLASH',
};

export function DirectorChat(props: Props) {
  const [input, setInput] = useState('');
  const streamRef = useRef<HTMLDivElement | null>(null);
  const selectedProviderMode = props.providerStatus.mode === 'checking'
    ? 'checking'
    : props.model === 'gemini-3.5-flash'
      ? props.providerStatus.geminiConfigured ? 'gemini' : props.providerStatus.demoEnabled ? 'demo' : 'unconfigured'
      : props.providerStatus.openaiConfigured ? 'openai' : props.providerStatus.demoEnabled ? 'demo' : 'unconfigured';

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [props.messages, props.busy]);

  function submit() {
    const value = input.trim();
    if (!value || props.busy) return;
    setInput('');
    props.onSend(value);
  }

  function historyDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Saved project' : new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(date);
  }

  return (
    <aside className="director-chat" aria-label="Director Visual Expert">
      <header className="chat-head">
        <div className="chat-logo"><Sparkles size={16} /></div>
        <div>
          <span className="eyebrow">DIRECTOR · VISUAL EXPERT</span>
          <h2>Creative Director + Storyteller</h2>
          <p>Sees the canvas state · remembers the active Direction Contract</p>
        </div>
        <div className="chat-head-actions">
          <button type="button" className="new-project-button" title="Start a new Director project" onClick={props.onNewProject}><Plus size={16} /><span>New project</span></button>
          <button type="button" className={props.historyOpen ? 'active' : ''} title="Project history" aria-expanded={props.historyOpen} onClick={props.onToggleHistory}><History size={15} /></button>
        </div>
      </header>

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
        <span className={`persistence-state ${props.persistenceStatus}`}><HardDrive size={10} /> {props.persistenceStatus === 'saving' ? 'saving…' : props.persistenceStatus === 'saved' ? 'saved locally' : 'save unavailable'}</span>
      </div>

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
        {props.busy && (
          <div className="chat-message assistant thinking">
            <span className="message-avatar"><Bot size={12} /></span>
            <div className="thinking-orbit"><i /><i /><i /></div>
          </div>
        )}
      </div>

      <div className="chat-composer-wrap">
        <div className="quick-actions">
          {quickActions.map(([label, prompt]) => (
            <button
              key={label}
              type="button"
              disabled={props.busy
                || (label === 'Compile direction' && props.referenceCount < 2)
                || (label === 'Build visual story' && !props.hasContract)
                || (label === 'Check drift' && !props.hasSequence)
                || (label === 'Make reel' && props.referenceCount < 1)
                || (label === 'Render reel' && !props.hasReel)}
              title={label === 'Compile direction' && props.referenceCount < 2
                ? 'Add at least two references first'
                : label === 'Build visual story' && !props.hasContract
                  ? 'Compile a Direction Contract first'
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
            rows={3}
          />
          <div className="composer-footer">
            <select value={props.model} onChange={(event) => props.onModelChange(event.target.value as DirectorModel)} aria-label="Director model">
              {DIRECTOR_MODELS.map((model) => <option key={model} value={model}>{DIRECTOR_MODEL_LABELS[model]}</option>)}
            </select>
            <span className={`provider-status ${selectedProviderMode}`} title={selectedProviderMode === 'demo'
              ? `This separate Worker needs its own ${props.model === 'gemini-3.5-flash' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'} secret.`
              : undefined}>
              {selectedProviderMode === 'checking'
                ? 'CHECKING MODEL…'
                : props.model === 'gemini-3.5-flash' && props.providerStatus.geminiConfigured
                  ? 'GEMINI CONNECTED'
                  : props.model !== 'gemini-3.5-flash' && props.providerStatus.openaiConfigured
                    ? 'OPENAI CONNECTED'
                    : selectedProviderMode === 'demo'
                      ? 'DEMO FALLBACK · KEY NEEDED'
                      : 'MODEL NOT CONFIGURED'}
            </span>
            <span className="privacy-note">media renders locally</span>
            <button className="send-button" type="button" onClick={submit} disabled={props.busy || !input.trim()}>
              <span>Send</span><ArrowUp size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
