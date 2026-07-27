export type DirectorLocalOutputBackend = 'ffmpeg';

export type DirectorLocalOutputResponse = {
  ok: true;
  backend: DirectorLocalOutputBackend;
  outputPath: string;
  outputBytes: number;
};

export class DirectorLocalOutputUnavailableError extends Error {
  constructor() {
    super('Director’s local output service is unavailable.');
    this.name = 'DirectorLocalOutputUnavailableError';
  }
}

function responseRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function saveDirectorLocalOutput(
  output: Blob,
  title: string,
  request: typeof fetch = fetch,
): Promise<DirectorLocalOutputResponse> {
  const endpoint = new URL('api/local-output/save', document.baseURI);
  endpoint.searchParams.set('title', title);
  let response: Response;
  try {
    response = await request(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'video/mp4',
        'x-director-local': '1',
      },
      body: output,
      credentials: 'same-origin',
    });
  } catch {
    throw new DirectorLocalOutputUnavailableError();
  }
  if (response.status === 404) throw new DirectorLocalOutputUnavailableError();
  const payload = responseRecord(await response.json().catch(() => null));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Director could not save the rendered output locally.',
    );
  }
  if (
    payload?.ok !== true
    || payload.backend !== 'ffmpeg'
    || typeof payload.outputPath !== 'string'
    || typeof payload.outputBytes !== 'number'
  ) {
    throw new Error('Director’s local output service returned an invalid receipt.');
  }
  return payload as DirectorLocalOutputResponse;
}

export async function revealDirectorLocalOutput(
  outputPath: string,
  request: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await request(
      new URL('api/local-output/reveal', document.baseURI),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-director-local': '1',
        },
        body: JSON.stringify({ outputPath }),
        credentials: 'same-origin',
      },
    );
  } catch {
    throw new DirectorLocalOutputUnavailableError();
  }
  if (response.status === 404) throw new DirectorLocalOutputUnavailableError();
  const payload = responseRecord(await response.json().catch(() => null));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : 'Director could not reveal that output in Finder.',
    );
  }
}
