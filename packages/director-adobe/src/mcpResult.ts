const MAX_ENVELOPE_DEPTH = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstTextBlock(content: unknown) {
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      return block.text;
    }
  }
  return undefined;
}

function parseJsonRecord(text: string) {
  let current = text.trim();
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current.startsWith('{') && !current.startsWith('"')) return undefined;
    try {
      const parsed: unknown = JSON.parse(current);
      if (isRecord(parsed)) return parsed;
      if (typeof parsed !== 'string') return undefined;
      current = parsed.trim();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function unwrapResponse(value: Record<string, unknown>) {
  let current = value;
  for (let depth = 0; depth < MAX_ENVELOPE_DEPTH; depth += 1) {
    const response = isRecord(current.response) ? current.response : undefined;
    const text = response ? firstTextBlock(response.content) : undefined;
    const parsed = text ? parseJsonRecord(text) : undefined;
    if (!parsed) return current;
    current = parsed;
  }
  return current;
}

/**
 * Adobe script servers commonly report transport success while placing the
 * real ExtendScript result (or exception) in nested JSON text envelopes.
 */
export function normalizeAdobeMcpResponse(value: unknown) {
  if (!isRecord(value) || isRecord(value.structuredContent)) return value;
  const text = firstTextBlock(value.content);
  const parsed = text ? parseJsonRecord(text) : undefined;
  return parsed ? { ...value, structuredContent: unwrapResponse(parsed) } : value;
}

export function adobeMcpReceipt(value: unknown) {
  const normalized = normalizeAdobeMcpResponse(value);
  if (!isRecord(normalized)) {
    throw new Error('The Adobe MCP server returned an unreadable response.');
  }
  if (normalized.isError === true) {
    throw new Error('The Adobe MCP server rejected the Director handoff script.');
  }
  const payload = isRecord(normalized.structuredContent)
    ? normalized.structuredContent
    : normalized;
  if (typeof payload.error === 'string' && payload.error.length > 0) {
    const line = typeof payload.line === 'number' || typeof payload.line === 'string'
      ? ` at ExtendScript line ${payload.line}`
      : '';
    throw new Error(`After Effects could not build the Director composition${line}: ${payload.error}`);
  }
  if (payload.status !== 'queued') {
    throw new Error('After Effects did not return Director’s queued-render receipt.');
  }
  return { normalized, receipt: payload };
}
