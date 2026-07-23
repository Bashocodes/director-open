import { parseJsonEvent, readSseData, requireSuccessfulResponse } from './streaming';
import type { ChatProvider } from './types';

export function createOpenAIProvider(fetchImpl: typeof fetch = fetch): ChatProvider {
  return {
    id: 'openai',
    label: 'OpenAI',
    capabilities: { streaming: true, jsonMode: true, toolCalling: true },
    async *stream(request) {
      if (!request.apiKey?.trim()) throw new Error('Add an OpenAI API key in AI settings.');
      const response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        credentials: 'omit',
        signal: request.signal,
        headers: {
          authorization: `Bearer ${request.apiKey.trim()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model,
          instructions: request.systemPrompt,
          input: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          stream: true,
          store: false,
        }),
      });
      await requireSuccessfulResponse(response, 'openai');
      for await (const data of readSseData(response)) {
        const event = parseJsonEvent(data);
        if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          yield event.delta;
        }
      }
    },
  };
}
