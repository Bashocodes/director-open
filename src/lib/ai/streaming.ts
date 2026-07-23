import { ChatProviderError, type ChatProviderId } from './types';

export async function requireSuccessfulResponse(
  response: Response,
  provider: ChatProviderId,
) {
  if (response.ok && response.body) return response;
  throw new ChatProviderError(
    response.status === 401 || response.status === 403
      ? `${provider} rejected the browser-stored credential. Check the key and try again.`
      : `${provider} returned HTTP ${response.status || 'error'}.`,
    provider,
    response.status,
  );
}

export async function* readSseData(response: Response): AsyncGenerator<string> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
      if (done) break;
    }
    const finalData = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (finalData) yield finalData;
  } finally {
    reader.releaseLock();
  }
}

export function parseJsonEvent(data: string) {
  if (data === '[DONE]') return null;
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}
