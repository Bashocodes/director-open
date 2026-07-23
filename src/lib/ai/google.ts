import { parseJsonEvent, readSseData, requireSuccessfulResponse } from './streaming';
import type { ChatProvider } from './types';

function textParts(event: Record<string, unknown>) {
  const candidates = Array.isArray(event.candidates) ? event.candidates : [];
  return candidates.flatMap((candidate) => {
    const content = candidate && typeof candidate === 'object'
      ? (candidate as Record<string, unknown>).content
      : null;
    const parts = content && typeof content === 'object' && Array.isArray((content as Record<string, unknown>).parts)
      ? (content as Record<string, unknown>).parts as unknown[]
      : [];
    return parts.flatMap((part) => (
      part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string'
        ? [(part as Record<string, unknown>).text as string]
        : []
    ));
  });
}

export function createGoogleProvider(fetchImpl: typeof fetch = fetch): ChatProvider {
  return {
    id: 'google',
    label: 'Google Gemini',
    capabilities: { streaming: true, jsonMode: true, toolCalling: true },
    async *stream(request) {
      if (!request.apiKey?.trim()) throw new Error('Add a Google Gemini API key in AI settings.');
      const model = encodeURIComponent(request.model.trim());
      const response = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          credentials: 'omit',
          signal: request.signal,
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': request.apiKey.trim(),
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.systemPrompt }] },
            contents: request.messages.map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
            generationConfig: { maxOutputTokens: 4_096 },
          }),
        },
      );
      await requireSuccessfulResponse(response, 'google');
      for await (const data of readSseData(response)) {
        const event = parseJsonEvent(data);
        if (!event) continue;
        for (const text of textParts(event)) yield text;
      }
    },
  };
}
