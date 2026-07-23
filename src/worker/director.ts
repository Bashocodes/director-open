import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  DIRECTOR_RESPONSE_JSON_SCHEMA,
  DirectorRequestSchema,
  DirectorResponseSchema,
  type DirectorResponse,
} from '../shared/directorSchemas';
import type { z } from 'zod';
import { createDemoResponse } from './demo';
import type { DirectorEnv } from './env';

const DIRECTOR_INSTRUCTIONS = `You are Director Visual Expert: a canvas-aware creative director and visual storyteller.

The user works in one permanent interface: visual objects or Reel Studio on the left and your conversation on the right. They upload local references, assign what each source contributes, compile a Direction Contract, transform the approved contract into a coherent visual sequence, and edit a reel locally in the browser.

Treat canvas JSON as authoritative project state. Summaries are compact visual evidence. Do not claim access to image content or private fields that are absent.

Canvas changes are only real when you return a matching canvasActions entry. Never say that you placed, selected, removed, or edited canvas objects unless you return the action that performs it. The local library is user-owned and starts empty: never use search_and_add, invent an asset, or invent an image URL. Ask the user to upload references when the board has too few. For unused action fields, return null or an empty array.

Reel changes are only real when you return a matching reelActions entry. The available tools can open Reel Studio, add/remove/reorder clips, apply a color grade (effect), apply a distinct structural visual effect (visualEffect), set a transition, camera move, duration, strength or caption, set project format/fps/quality, and request a render. Cinematic, HDR, warm, cool, monochrome, teal-orange, vintage-film, punch and bleach-bypass are color grades. The current visual effects are pixel-sort, glitch-burst, crt-scan, halftone-reveal, ripple-drift, motion-echo and threshold-melt. Retired user vocabulary remains accepted for compatibility: RGB split resolves to glitch-burst, scanlines resolves to crt-scan, and grain/glow/dream haze/vignette/blur/loop pulse/halation/anamorphic bloom resolve to no visual effect with an honest receipt suggesting a color-grade alternative. Use clip IDs from projectState.reelProject when they exist and canvas object IDs when opening or adding clips. Empty clipIds means the currently selected reel clips, or every clip if none is selected. If the user explicitly says all, every, or the entire reel, include every current clip ID. Never claim a video was rendered by the model: request_render opens the confirmed local-render step, and FFmpeg runs on the user's device. Never ask the user to upload media to the model or server. Music must be selected locally by the user.

Your jobs are to inspect sources, resolve inheritance and conflicts, compile an editable Direction Contract, build 3–8 story beats, detect continuity drift, and translate natural-language editing requests into executable reel tools. Express scores as percentages from 0 to 100. Keep message text concise because the interface renders the artifacts. When evidence is insufficient, explain the uncertainty and suggest one bounded next action.`;

type DirectorRequest = z.infer<typeof DirectorRequestSchema>;
const MAX_DIRECTOR_BODY_BYTES = 1_500_000;

class DirectorBodyTooLargeError extends Error {}

function geminiStructuredSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiStructuredSchema);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.anyOf) && record.anyOf.length === 2) {
    const nonNull = record.anyOf.find((item) => (
      item && typeof item === 'object' && (item as Record<string, unknown>).type !== 'null'
    ));
    const hasNull = record.anyOf.some((item) => (
      item && typeof item === 'object' && (item as Record<string, unknown>).type === 'null'
    ));
    if (hasNull && nonNull) {
      const converted = geminiStructuredSchema(nonNull) as Record<string, unknown>;
      const baseType = converted.type;
      if (typeof baseType === 'string') return { ...converted, type: [baseType, 'null'] };
    }
  }
  return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, geminiStructuredSchema(nested)]));
}

const GEMINI_DIRECTOR_SCHEMA = geminiStructuredSchema(DIRECTOR_RESPONSE_JSON_SCHEMA);

async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_DIRECTOR_BODY_BYTES) throw new DirectorBodyTooLargeError();
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DIRECTOR_BODY_BYTES) {
        await reader.cancel();
        throw new DirectorBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function visualReferenceCount(canvas: Array<{ kind: string }>) {
  return canvas.filter((object) => ['reference', 'upload', 'created'].includes(object.kind)).length;
}

export function reconcileDirectorResponse(
  response: DirectorResponse,
  existingReferenceCount: number,
): DirectorResponse {
  const canvasActions = response.canvasActions.filter((action) => action.type !== 'search_and_add');
  const removedSearchAction = canvasActions.length !== response.canvasActions.length;
  const sanitized = !removedSearchAction
    ? response
    : {
        ...response,
        message: 'The local library starts empty. Upload your own images before asking me to place or select references.',
        canvasActions,
      };
  const unsupportedMutationClaim = sanitized.canvasActions.length === 0
    && /\bI (?:have )?(?:placed|added|removed|selected|moved|updated)\b/i.test(response.message);

  if (existingReferenceCount < 2 && !sanitized.directionContract) {
    return {
      ...sanitized,
      message: unsupportedMutationClaim
        ? 'I did not change the canvas. Upload local references before asking me to edit them.'
        : sanitized.message,
      sequence: null,
      continuity: null,
    };
  }
  if (existingReferenceCount < 2) {
    return {
      ...sanitized,
      message: 'Upload at least two visual references before compiling a Direction Contract.',
      directionContract: null,
      sequence: null,
      continuity: null,
      mode: 'inspect',
    };
  }
  return unsupportedMutationClaim
    ? { ...sanitized, message: 'I did not change the canvas because no executable canvas action was returned.' }
    : sanitized;
}

async function runGemini(body: DirectorRequest, apiKey: string): Promise<DirectorResponse> {
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: DIRECTOR_INSTRUCTIONS }] },
    contents: [{
      role: 'user',
      parts: [{ text: JSON.stringify({ userRequest: body.message, projectState: body.context }) }],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: GEMINI_DIRECTOR_SCHEMA,
      thinkingConfig: { thinkingLevel: 'medium' },
      maxOutputTokens: 16_384,
    },
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: requestBody,
        },
      );
    } catch (error) {
      if (attempt === 0) continue;
      throw error;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
      throw new Error(`Gemini ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
    }
    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
    const candidate = payload.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((part) => part.text || '').join('').trim();
    if (!text) {
      const reason = payload.promptFeedback?.blockReason || candidate?.finishReason || 'UNKNOWN';
      if (attempt === 0 && !payload.promptFeedback?.blockReason) continue;
      throw new Error(`Gemini returned no structured Director result (${reason})`);
    }
    try {
      return DirectorResponseSchema.parse(JSON.parse(text));
    } catch (error) {
      if (attempt === 0) continue;
      throw error;
    }
  }
  throw new Error('Gemini could not produce a structured Director result.');
}

async function runOpenAI(body: DirectorRequest, apiKey: string): Promise<DirectorResponse> {
  const openai = new OpenAI({ apiKey });
  const response = await openai.responses.parse({
    model: body.model,
    instructions: DIRECTOR_INSTRUCTIONS,
    reasoning: { effort: 'medium' },
    store: false,
    safety_identifier: `director_${body.sessionId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64),
    input: JSON.stringify({ userRequest: body.message, projectState: body.context }),
    text: {
      format: zodTextFormat(DirectorResponseSchema, 'director_open_response'),
      verbosity: 'low',
    },
  });
  if (!response.output_parsed) throw new Error('OpenAI returned no structured Director result');
  return DirectorResponseSchema.parse(response.output_parsed);
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function handleDirector(request: Request, env: DirectorEnv): Promise<Response> {
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof DirectorBodyTooLargeError) {
      return json({ ok: false, error: 'Director context is too large.' }, 413);
    }
    return json({ ok: false, error: 'Invalid Director request.' }, 400);
  }
  const parsed = DirectorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid Director request.', details: parsed.error.flatten() }, 400);
  }

  try {
    const body = parsed.data;
    let modelOutput: DirectorResponse;
    let provider: 'demo' | 'gemini' | 'openai';
    if (body.model === 'gemini-3.5-flash' && env.GEMINI_API_KEY) {
      modelOutput = await runGemini(body, env.GEMINI_API_KEY);
      provider = 'gemini';
    } else if (body.model !== 'gemini-3.5-flash' && env.OPENAI_API_KEY) {
      modelOutput = await runOpenAI(body, env.OPENAI_API_KEY);
      provider = 'openai';
    } else if (env.DIRECTOR_DEMO_MODE === '1') {
      modelOutput = createDemoResponse(body.message, body.context);
      provider = 'demo';
    } else if (body.model === 'gemini-3.5-flash') {
      return json({ ok: false, error: 'Gemini is not configured for this Director Worker.' }, 503);
    } else {
      return json({ ok: false, error: 'OpenAI is not configured for this Director Worker.' }, 503);
    }

    const response = reconcileDirectorResponse(
      modelOutput,
      visualReferenceCount(body.context.canvas),
    );
    const canvasActionResults: never[] = [];
    return json({ ok: true, response, canvasActionResults, model: body.model, provider });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'director_turn_failed',
      message: error instanceof Error ? error.message : 'unknown',
    }));
    return json({ ok: false, error: 'The Visual Expert could not complete this turn.' }, 502);
  }
}
