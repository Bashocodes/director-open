import { z } from 'zod';
import { CHAT_PROVIDER_IDS, type ChatProviderId } from './types';

export const AI_VAULT_STORAGE_KEY = 'director-open.ai-settings.v1';

const ProviderSettingsSchema = z.object({
  apiKey: z.string().max(2_000),
  model: z.string().max(240),
}).strict();

const AiSettingsSchema = z.object({
  version: z.literal(1),
  selectedProvider: z.enum(CHAT_PROVIDER_IDS),
  providers: z.object({
    openai: ProviderSettingsSchema,
    anthropic: ProviderSettingsSchema,
    google: ProviderSettingsSchema,
    custom: ProviderSettingsSchema.extend({ baseUrl: z.string().max(2_000) }).strict(),
  }).strict(),
}).strict();

export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type ProviderSettings = AiSettings['providers'][ChatProviderId];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  version: 1,
  selectedProvider: 'openai',
  providers: {
    openai: { apiKey: '', model: 'gpt-5.6' },
    anthropic: { apiKey: '', model: 'claude-sonnet-5' },
    google: { apiKey: '', model: 'gemini-3.6-flash' },
    custom: {
      apiKey: '',
      model: 'qwen3',
      baseUrl: 'http://127.0.0.1:11434/v1',
    },
  },
};

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadAiSettings(storage: Pick<Storage, 'getItem'> | null = browserStorage()) {
  if (!storage) return structuredClone(DEFAULT_AI_SETTINGS);
  try {
    const parsed = AiSettingsSchema.safeParse(JSON.parse(storage.getItem(AI_VAULT_STORAGE_KEY) || 'null'));
    return parsed.success ? parsed.data : structuredClone(DEFAULT_AI_SETTINGS);
  } catch {
    return structuredClone(DEFAULT_AI_SETTINGS);
  }
}

export function saveAiSettings(
  settings: AiSettings,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
) {
  const parsed = AiSettingsSchema.safeParse(settings);
  if (!parsed.success) return false;
  if (!storage) return false;
  try {
    storage.setItem(AI_VAULT_STORAGE_KEY, JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}

export function removeProviderKey(
  settings: AiSettings,
  provider: ChatProviderId,
) {
  return {
    ...settings,
    providers: {
      ...settings.providers,
      [provider]: { ...settings.providers[provider], apiKey: '' },
    },
  } as AiSettings;
}

export function maskApiKey(value: string) {
  const key = value.trim();
  if (!key) return 'Not set';
  if (key.length <= 7) return '••••••••';
  return `${key.slice(0, 3)}••••${key.slice(-4)}`;
}

export function isProviderConfigured(settings: AiSettings, provider = settings.selectedProvider) {
  const providerSettings = settings.providers[provider];
  if (!providerSettings.model.trim()) return false;
  if (provider === 'custom') {
    return Boolean((providerSettings as AiSettings['providers']['custom']).baseUrl.trim());
  }
  return Boolean(providerSettings.apiKey.trim());
}
