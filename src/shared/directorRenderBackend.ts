/** Render engines that Director can target. FFmpeg is always available. */
export const DIRECTOR_RENDER_BACKENDS = ['ffmpeg', 'after-effects'] as const;
export type DirectorRenderBackend = (typeof DIRECTOR_RENDER_BACKENDS)[number];

/** Internal colour precision requested from a render backend. */
export const DIRECTOR_COLOR_DEPTHS = [8, 16, 32] as const;
export type DirectorColorDepth = (typeof DIRECTOR_COLOR_DEPTHS)[number];

export const DIRECTOR_DEFAULT_RENDER_BACKEND: DirectorRenderBackend = 'ffmpeg';
export const DIRECTOR_DEFAULT_COLOR_DEPTH: DirectorColorDepth = 8;

export function effectiveRenderBackend(project: { renderBackend?: DirectorRenderBackend }): DirectorRenderBackend {
  return project.renderBackend ?? DIRECTOR_DEFAULT_RENDER_BACKEND;
}

export function effectiveColorDepth(project: {
  renderBackend?: DirectorRenderBackend;
  colorDepth?: DirectorColorDepth;
}): DirectorColorDepth {
  // These values describe the executable output paths, not aspirational
  // metadata: Director's current FFmpeg delivery is yuv420p8 and AE is forced
  // to a 32-bpc float composition by the handoff contract.
  return effectiveRenderBackend(project) === 'after-effects'
    ? 32
    : DIRECTOR_DEFAULT_COLOR_DEPTH;
}

export function renderBackendLabel(backend: DirectorRenderBackend) {
  return backend === 'after-effects' ? 'Adobe After Effects' : 'FFmpeg (free/local)';
}
