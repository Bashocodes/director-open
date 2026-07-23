export const CHAT_PROVIDER_IDS = ['openai', 'anthropic', 'google', 'custom'] as const;

export type ChatProviderId = typeof CHAT_PROVIDER_IDS[number];

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatProviderRequest = {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
};

export type ChatProviderCapabilities = {
  streaming: true;
  jsonMode: boolean;
  toolCalling: boolean;
};

export interface ChatProvider {
  id: ChatProviderId;
  label: string;
  capabilities: ChatProviderCapabilities;
  stream(request: ChatProviderRequest): AsyncIterable<string>;
}

export class ChatProviderError extends Error {
  constructor(
    message: string,
    readonly provider: ChatProviderId,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ChatProviderError';
  }
}
