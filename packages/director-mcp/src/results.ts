import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { errorPayload } from './errors';

type JsonObject = Record<string, unknown>;

function asText(payload: JsonObject) {
  return JSON.stringify(payload, null, 2);
}

export function toolSuccess(payload: JsonObject): CallToolResult {
  return {
    content: [{ type: 'text', text: asText(payload) }],
    structuredContent: payload,
  };
}

export function toolFailure(error: unknown): CallToolResult {
  const payload = errorPayload(error);
  return {
    content: [{ type: 'text', text: asText(payload) }],
    structuredContent: payload,
    isError: true,
  };
}

export function withStructuredErrors<Arguments>(
  operation: (args: Arguments) => Promise<JsonObject> | JsonObject,
) {
  return async (args: Arguments): Promise<CallToolResult> => {
    try {
      return toolSuccess(await operation(args));
    } catch (error) {
      return toolFailure(error);
    }
  };
}
