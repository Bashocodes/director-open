import { createAnthropicProvider } from './anthropic';
import { createCustomProvider } from './custom';
import { createGoogleProvider } from './google';
import { createOpenAIProvider } from './openai';
import type { ChatProvider, ChatProviderId } from './types';

export function createChatProviders(fetchImpl: typeof fetch = fetch): Record<ChatProviderId, ChatProvider> {
  return {
    openai: createOpenAIProvider(fetchImpl),
    anthropic: createAnthropicProvider(fetchImpl),
    google: createGoogleProvider(fetchImpl),
    custom: createCustomProvider(fetchImpl),
  };
}

export function getChatProvider(id: ChatProviderId) {
  return createChatProviders()[id];
}
