import { parseJsonEvent, readSseData, requireSuccessfulResponse } from './streaming';
import type { ChatProvider } from './types';

export function customChatCompletionsUrl(rawBaseUrl: string) {
  const value = rawBaseUrl.trim();
  if (!value) throw new Error('Add a Custom/local base URL in AI settings.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Custom/local base URL must use HTTP or HTTPS.');
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Custom/local base URL cannot contain credentials, query parameters, or a fragment.');
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith('/chat/completions')
    ? path
    : path.endsWith('/v1')
      ? `${path}/chat/completions`
      : `${path}/v1/chat/completions`;
  return url.toString();
}

export function createCustomProvider(fetchImpl: typeof fetch = fetch): ChatProvider {
  return {
    id: 'custom',
    label: 'Custom / local',
    capabilities: { streaming: true, jsonMode: true, toolCalling: true },
    async *stream(request) {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (request.apiKey?.trim()) headers.authorization = `Bearer ${request.apiKey.trim()}`;
      const response = await fetchImpl(customChatCompletionsUrl(request.baseUrl || ''), {
        method: 'POST',
        credentials: 'omit',
        signal: request.signal,
        headers,
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            ...request.messages,
          ],
          stream: true,
        }),
      });
      await requireSuccessfulResponse(response, 'custom');
      for await (const data of readSseData(response)) {
        const event = parseJsonEvent(data);
        const choices = Array.isArray(event?.choices) ? event.choices : [];
        for (const choice of choices) {
          const delta = choice && typeof choice === 'object'
            ? (choice as Record<string, unknown>).delta
            : null;
          if (delta && typeof delta === 'object' && typeof (delta as Record<string, unknown>).content === 'string') {
            yield (delta as Record<string, unknown>).content as string;
          }
        }
      }
    },
  };
}
