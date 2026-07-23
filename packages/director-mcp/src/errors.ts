export const DIRECTOR_MCP_ERROR_CODES = [
  'INVALID_ARGUMENT',
  'ACTION_LIMIT_EXCEEDED',
  'PATH_OUTSIDE_ROOT',
  'PATH_NOT_FOUND',
  'PATH_NOT_FILE',
  'PROJECT_TOO_LARGE',
  'PROJECT_INVALID',
  'PROJECT_NOT_LOADED',
  'IO_ERROR',
  'INTERNAL_ERROR',
] as const;

export type DirectorMcpErrorCode = typeof DIRECTOR_MCP_ERROR_CODES[number];

export type DirectorMcpErrorPayload = {
  ok: false;
  error: {
    code: DirectorMcpErrorCode;
    message: string;
    details?: unknown;
  };
};

export class DirectorMcpError extends Error {
  readonly code: DirectorMcpErrorCode;
  readonly details?: unknown;

  constructor(code: DirectorMcpErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DirectorMcpError';
    this.code = code;
    this.details = details;
  }
}

export function asDirectorMcpError(error: unknown) {
  if (error instanceof DirectorMcpError) return error;
  return new DirectorMcpError(
    'INTERNAL_ERROR',
    'The Director MCP operation could not be completed.',
  );
}

export function errorPayload(error: unknown): DirectorMcpErrorPayload {
  const directorError = asDirectorMcpError(error);
  return {
    ok: false,
    error: {
      code: directorError.code,
      message: directorError.message,
      ...(directorError.details === undefined ? {} : { details: directorError.details }),
    },
  };
}
