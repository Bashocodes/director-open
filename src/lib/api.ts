type ApiError = { ok: false; error: string };

const appBase = '/director';

export function directorAppUrl(input: string) {
  if (!input.startsWith('/') || input.startsWith('//')) return input;
  if (input === appBase || input.startsWith(`${appBase}/`)) return input;
  return `${appBase}${input}`;
}

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<(T & { ok: true }) | ApiError> {
  const resolvedInput = typeof input === 'string' ? directorAppUrl(input) : input;
  const response = await fetch(resolvedInput, init);
  const body = await response.json().catch(() => null) as unknown;

  if (!response.ok || !body || typeof body !== 'object') {
    const message = body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : 'The Director request could not be completed.';
    return { ok: false, error: message };
  }

  return { ...(body as T), ok: true };
}

export const api = {
  get<T>(url: string, signal?: AbortSignal) {
    return request<T>(url, { credentials: 'omit', headers: { accept: 'application/json' }, signal });
  },
  post<T>(url: string, payload: unknown, signal?: AbortSignal) {
    return request<T>(url, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  },
};
