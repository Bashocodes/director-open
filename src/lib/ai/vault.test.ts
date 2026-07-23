import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_VAULT_STORAGE_KEY,
  loadAiSettings,
  maskApiKey,
  removeProviderKey,
  saveAiSettings,
} from './vault';

describe('browser AI key vault', () => {
  beforeEach(() => window.localStorage.clear());

  it('stores all provider settings under one namespaced localStorage entry', () => {
    const settings = loadAiSettings();
    settings.providers.openai.apiKey = 'browser-only-credential-123456';
    settings.providers.openai.model = 'my-editable-model';
    expect(saveAiSettings(settings)).toBe(true);

    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe(AI_VAULT_STORAGE_KEY);
    expect(loadAiSettings().providers.openai).toEqual({
      apiKey: 'browser-only-credential-123456',
      model: 'my-editable-model',
    });
  });

  it('masks keys without exposing the full value and removes one provider key', () => {
    const settings = loadAiSettings();
    settings.providers.anthropic.apiKey = 'test0000000000';
    expect(maskApiKey(settings.providers.anthropic.apiKey)).toBe('tes••••0000');

    const removed = removeProviderKey(settings, 'anthropic');
    expect(removed.providers.anthropic.apiKey).toBe('');
    expect(removed.providers.openai).toEqual(settings.providers.openai);
  });
});
