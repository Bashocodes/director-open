import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DirectorResponse } from '../shared/directorSchemas';
import { handleDirector } from './director';

const openaiHarness = vi.hoisted(() => ({ parse: vi.fn() }));

vi.mock('openai', () => ({
  default: class {
    constructor(_options: unknown) {}
    responses = { parse: openaiHarness.parse };
  },
}));

const response: DirectorResponse = {
  message: 'Direction compiled.',
  mode: 'combine',
  directionContract: {
    title: 'Controlled direction',
    objective: 'Build one coherent visual language.',
    inheritance: [],
    locks: ['identity'],
    exclusions: ['neon'],
    conflicts: [],
    coherence: 92,
  },
  sequence: null,
  continuity: null,
  canvasActions: [],
  reelActions: [],
  suggestedActions: ['Build visual story'],
};

function request(model = 'gpt-5.4') {
  return new Request('https://director.test/api/director', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: 'Compile this direction.',
      model,
      sessionId: 'session-1234',
      context: {
        mode: 'combine',
        goal: 'A coherent visual story',
        exclusions: [],
        canvas: [],
        visibleSearch: null,
        recentConversation: [],
        directionContract: null,
        sequence: null,
      },
    }),
  });
}

function rawRequest(body: string, contentLength?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (contentLength) headers.set('content-length', contentLength);
  return new Request('https://director.test/api/director', { method: 'POST', headers, body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  openaiHarness.parse.mockReset();
});

describe('Director model providers', () => {
  it('uses Gemini 3.5 Flash structured output when an optional server key is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleDirector(request('gemini-3.5-flash'), { GEMINI_API_KEY: 'test-only' });
    const body = await result.json() as Record<string, unknown>;

    expect(result.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      provider: 'gemini',
      response: { mode: 'inspect', directionContract: null, canvasActions: [] },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/v1beta/models/gemini-3.5-flash:generateContent');
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'test-only' });
    const payload = JSON.parse(String(init.body));
    expect(payload.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: expect.any(Object),
      thinkingConfig: { thinkingLevel: 'medium' },
    });
    expect(String(init.body)).not.toContain('anyOf');
  });

  it('retries one transient Gemini failure before returning the structured edit', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleDirector(request('gemini-3.5-flash'), { GEMINI_API_KEY: 'test-only' });
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({ ok: true, provider: 'gemini' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['gpt-5.4', 'gpt-5.4-mini'] as const)('uses OpenAI Responses structured output for %s', async (model) => {
    openaiHarness.parse.mockResolvedValue({ output_parsed: response });

    const result = await handleDirector(request(model), { OPENAI_API_KEY: 'test-only' });
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({ ok: true, provider: 'openai', model });
    expect(openaiHarness.parse).toHaveBeenCalledOnce();
    expect(openaiHarness.parse).toHaveBeenCalledWith(expect.objectContaining({
      model,
      reasoning: { effort: 'medium' },
      store: false,
      safety_identifier: 'director_session-1234',
      text: expect.objectContaining({ verbosity: 'low' }),
    }));
  });

  it('honors the selected provider when both provider secrets are configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    openaiHarness.parse.mockResolvedValue({ output_parsed: response });
    const bindings = { OPENAI_API_KEY: 'openai-test', GEMINI_API_KEY: 'gemini-test' };

    const openaiResult = await handleDirector(request('gpt-5.4'), bindings);
    expect(openaiResult.status).toBe(200);
    await expect(openaiResult.json()).resolves.toMatchObject({ provider: 'openai', model: 'gpt-5.4' });
    expect(openaiHarness.parse).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();

    const geminiResult = await handleDirector(request('gemini-3.5-flash'), bindings);
    expect(geminiResult.status).toBe(200);
    await expect(geminiResult.json()).resolves.toMatchObject({ provider: 'gemini', model: 'gemini-3.5-flash' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    ['gpt-5.4', { GEMINI_API_KEY: 'other-provider-only' }, 'OpenAI'],
    ['gemini-3.5-flash', { OPENAI_API_KEY: 'other-provider-only' }, 'Gemini'],
  ] as const)('does not substitute another configured provider for %s', async (model, bindings, provider) => {
    const result = await handleDirector(request(model), bindings);
    expect(result.status).toBe(503);
    await expect(result.json()).resolves.toMatchObject({ ok: false, error: expect.stringContaining(provider) });
  });

  it.each([
    ['gpt-5.4', { GEMINI_API_KEY: 'other-provider-only', DIRECTOR_DEMO_MODE: '1' }],
    ['gemini-3.5-flash', { OPENAI_API_KEY: 'other-provider-only', DIRECTOR_DEMO_MODE: '1' }],
  ] as const)('uses the visible demo fallback when the selected provider for %s is not configured', async (model, bindings) => {
    const result = await handleDirector(request(model), bindings);
    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toMatchObject({ ok: true, provider: 'demo', model });
  });

  it('fails closed when a configured OpenAI call has no structured output', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openaiHarness.parse.mockResolvedValue({ output_parsed: null });

    const result = await handleDirector(request(), { OPENAI_API_KEY: 'test-only', DIRECTOR_DEMO_MODE: '1' });
    expect(result.status).toBe(502);
    await expect(result.json()).resolves.toMatchObject({
      ok: false,
      error: 'The Visual Expert could not complete this turn.',
    });
  });

  it('runs the full fallback without any runtime API key', async () => {
    const result = await handleDirector(request(), { DIRECTOR_DEMO_MODE: '1' });
    const body = await result.json() as Record<string, unknown>;

    expect(result.status).toBe(200);
    expect(body).toMatchObject({ ok: true, provider: 'demo', model: 'gpt-5.4' });
  });

  it('requires a provider secret only when deterministic fallback mode is disabled', async () => {
    const result = await handleDirector(request(), {});
    expect(result.status).toBe(503);
    await expect(result.json()).resolves.toMatchObject({ ok: false, error: expect.stringContaining('OpenAI') });
  });

  it('rejects an oversized body even when Content-Length is absent or dishonest', async () => {
    const oversized = JSON.stringify({ message: 'x'.repeat(1_500_001) });
    const withoutLength = await handleDirector(rawRequest(oversized), { DIRECTOR_DEMO_MODE: '1' });
    const dishonestLength = await handleDirector(rawRequest(oversized, '1'), { DIRECTOR_DEMO_MODE: '1' });
    expect(withoutLength.status).toBe(413);
    expect(dishonestLength.status).toBe(413);
  });

  it('returns a bounded 400 response for malformed JSON', async () => {
    const result = await handleDirector(rawRequest('{"message":'), { DIRECTOR_DEMO_MODE: '1' });
    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toMatchObject({ ok: false, error: 'Invalid Director request.' });
  });
});
