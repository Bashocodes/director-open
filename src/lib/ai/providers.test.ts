import { describe, expect, it, vi } from 'vitest';
import { createChatProviders } from './providers';

function sse(data: unknown) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return new Response(`data: ${payload}\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

async function collect(stream: AsyncIterable<string>) {
  let value = '';
  for await (const delta of stream) value += delta;
  return value;
}

const baseRequest = {
  apiKey: 'secret-test-key',
  model: 'editable-model',
  systemPrompt: 'You are Director.',
  messages: [{ role: 'user' as const, content: 'Suggest one edit.' }],
};

describe('browser-direct provider request shaping', () => {
  it('streams OpenAI Responses events with the key only in Authorization', async () => {
    const fetchMock = vi.fn(async () => sse({ type: 'response.output_text.delta', delta: 'OpenAI' }));
    const provider = createChatProviders(fetchMock as typeof fetch).openai;

    await expect(collect(provider.stream(baseRequest))).resolves.toBe('OpenAI');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(headers.get('authorization')).toBe('Bearer secret-test-key');
    expect(String(init.body)).not.toContain('secret-test-key');
    expect(url).not.toContain('secret-test-key');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'editable-model',
      stream: true,
      store: false,
    });
    expect(provider.capabilities).toEqual({ streaming: true, jsonMode: true, toolCalling: true });
  });

  it('streams Anthropic Messages events with direct-browser access enabled', async () => {
    const fetchMock = vi.fn(async () => sse({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Anthropic' },
    }));
    const provider = createChatProviders(fetchMock as typeof fetch).anthropic;

    await expect(collect(provider.stream(baseRequest))).resolves.toBe('Anthropic');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers.get('x-api-key')).toBe('secret-test-key');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(headers.get('anthropic-version')).toBe('2023-06-01');
    expect(String(init.body)).not.toContain('secret-test-key');
    expect(provider.capabilities.jsonMode).toBe(false);
  });

  it('streams Gemini events and never places its key in the URL', async () => {
    const fetchMock = vi.fn(async () => sse({
      candidates: [{ content: { parts: [{ text: 'Gemini' }] } }],
    }));
    const provider = createChatProviders(fetchMock as typeof fetch).google;

    await expect(collect(provider.stream(baseRequest))).resolves.toBe('Gemini');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/editable-model:streamGenerateContent?alt=sse');
    expect(headers.get('x-goog-api-key')).toBe('secret-test-key');
    expect(url).not.toContain('secret-test-key');
    expect(String(init.body)).not.toContain('secret-test-key');
  });

  it('streams an OpenAI-compatible local endpoint with an optional header token', async () => {
    const fetchMock = vi.fn(async () => sse({
      choices: [{ delta: { content: 'Local' } }],
    }));
    const provider = createChatProviders(fetchMock as typeof fetch).custom;

    await expect(collect(provider.stream({
      ...baseRequest,
      baseUrl: 'http://127.0.0.1:11434/v1',
    }))).resolves.toBe('Local');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret-test-key');
    expect(url).not.toContain('secret-test-key');
    expect(String(init.body)).not.toContain('secret-test-key');
  });

  it('never calls the Director Worker for any provider', async () => {
    const fetchMock = vi.fn(async () => sse('[DONE]'));
    const providers = createChatProviders(fetchMock as typeof fetch);
    await Promise.all([
      collect(providers.openai.stream(baseRequest)),
      collect(providers.anthropic.stream(baseRequest)),
      collect(providers.google.stream(baseRequest)),
      collect(providers.custom.stream({ ...baseRequest, baseUrl: 'http://localhost:1234/v1' })),
    ]);
    const calledUrls = (fetchMock.mock.calls as unknown as Array<[RequestInfo | URL]>)
      .map(([url]) => String(url));
    expect(calledUrls).not.toEqual(
      expect.arrayContaining([expect.stringContaining('/director/api/')]),
    );
  });
});
