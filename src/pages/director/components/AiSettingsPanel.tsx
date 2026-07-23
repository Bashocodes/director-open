import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  maskApiKey,
  removeProviderKey,
  type AiSettings,
} from '../../../lib/ai/vault';
import { CHAT_PROVIDER_IDS, type ChatProviderId } from '../../../lib/ai/types';

type Props = {
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
  onClose: () => void;
};

const PROVIDER_LABELS: Record<ChatProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google Gemini',
  custom: 'Custom / local',
};

export function AiSettingsPanel({ settings, onChange, onClose }: Props) {
  const [provider, setProvider] = useState<ChatProviderId>(settings.selectedProvider);
  const [apiKey, setApiKey] = useState('');
  const current = settings.providers[provider];
  const custom = provider === 'custom' ? settings.providers.custom : null;

  useEffect(() => setApiKey(''), [provider]);

  function updateProvider(patch: Record<string, string>) {
    onChange({
      ...settings,
      selectedProvider: provider,
      providers: {
        ...settings.providers,
        [provider]: { ...current, ...patch },
      },
    } as AiSettings);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    updateProvider(apiKey.trim() ? { apiKey: apiKey.trim() } : {});
    setApiKey('');
  }

  return (
    <section className="ai-settings-panel" aria-label="AI provider settings">
      <header>
        <div><KeyRound size={14} /><strong>Browser-only AI settings</strong></div>
        <button type="button" title="Close AI settings" onClick={onClose}><X size={15} /></button>
      </header>
      <p className="ai-vault-note">
        <ShieldCheck size={13} />
        Keys never leave this browser except in a direct request to the provider you choose. They are never sent to the Director worker.
      </p>
      <div className="ai-provider-tabs" role="tablist" aria-label="AI providers">
        {CHAT_PROVIDER_IDS.map((id) => (
          <button
            type="button"
            role="tab"
            aria-selected={provider === id}
            className={provider === id ? 'active' : ''}
            key={id}
            onClick={() => setProvider(id)}
          >
            {PROVIDER_LABELS[id]}
          </button>
        ))}
      </div>
      <form onSubmit={save}>
        <label>
          Model
          <input
            value={current.model}
            onChange={(event) => updateProvider({ model: event.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {custom && (
          <label>
            OpenAI-compatible base URL
            <input
              type="url"
              value={custom.baseUrl}
              onChange={(event) => updateProvider({ baseUrl: event.target.value })}
              placeholder="http://127.0.0.1:11434/v1"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
        <label>
          {custom ? 'Access token (optional)' : 'API key'}
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={current.apiKey ? maskApiKey(current.apiKey) : 'Paste key'}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="ai-key-status">
          <span>Stored: {maskApiKey(current.apiKey)}</span>
          {current.apiKey && (
            <button
              type="button"
              className="remove-ai-key"
              onClick={() => onChange(removeProviderKey(settings, provider))}
            >
              <Trash2 size={11} /> Remove key
            </button>
          )}
        </div>
        <button type="submit" className="save-ai-settings">Use {PROVIDER_LABELS[provider]}</button>
      </form>
    </section>
  );
}
