import { parseJsonEvent, readSseData, requireSuccessfulResponse } from './streaming';
import type { ChatProvider } from './types';

export function createAnthropicProvider(fetchImpl: typeof fetch = fetch): ChatProvider {
  return {
    id: 'anthropic',
    label: 'Anthropic',
    capabilities: { streaming: true, jsonMode: false, toolCalling: true },
    async *stream(request) {
      if (!request.apiKey?.trim()) throw new Error('Add an Anthropic API key in AI settings.');
      const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        credentials: 'omit',
        signal: request.signal,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'x-api-key': request.apiKey.trim(),
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: 4_096,
          system: request.systemPrompt,
          messages: request.messages,
          stream: true,
        }),
      });
      await requireSuccessfulResponse(response, 'anthropic');
      for await (const data of readSseData(response)) {
        const event = parseJsonEvent(data);
        const delta = event?.delta as Record<string, unknown> | undefined;
        if (event?.type === 'content_block_delta' && delta?.type === 'text_delta' && typeof delta.text === 'string') {
          yield delta.text;
        }
      }
    },
  };
}
