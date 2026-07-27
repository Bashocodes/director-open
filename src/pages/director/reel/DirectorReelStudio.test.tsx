import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectorReelStudio } from './DirectorReelStudio';
import type { ReelProject } from './types';

const renderHarness = vi.hoisted(() => ({
  jobs: [] as Array<(callbacks?: {
    onStage: (stage: string, message: string) => void;
    onLog?: (message: string) => void;
    onVerify?: (report: unknown) => void;
  }) => Promise<Blob>>,
  cancellations: 0,
  failedVerifyReport: {
    version: 1 as const,
    verdict: 'fail' as const,
    entries: [{
      field: 'Container structure',
      value: 'Malformed fixture',
      sourceBox: null,
      status: 'fail' as const,
      message: 'The synthetic output is truncated — fail.',
    }],
  },
}));

const localOutputHarness = vi.hoisted(() => ({
  paths: [] as Array<string | Error>,
  saved: [] as Array<{ bytes: number; title: string }>,
  revealed: [] as string[],
}));

const adobeHarness = vi.hoisted(() => ({
  results: [] as Array<Record<string, unknown>>,
}));

vi.mock('./ReelPreview', () => ({ ReelPreview: () => <div>Preview</div> }));
vi.mock('./ffmpegRenderer', () => ({
  hasHeavyVisualEffects: (project: { clips: Array<{ visualEffect?: string; visualEffectStack?: string[] }> }) => (
    project.clips.some((clip) => (clip.visualEffectStack || [clip.visualEffect]).some((effect) => (
      [
        'pixel-sort', 'glitch-burst', 'crt-scan', 'halftone-reveal',
        'ripple-drift', 'motion-echo', 'threshold-melt',
      ].includes(effect || '')
    )))
  ),
  BrowserFfmpegRenderer: class {
    cancel() { renderHarness.cancellations += 1; }
    render(_project: unknown, callbacks: {
      onStage: (stage: string, message: string) => void;
      onLog?: (message: string) => void;
      onVerify?: (report: unknown) => void;
    }) {
      const job = renderHarness.jobs.shift();
      if (!job) throw new Error('Missing render test job.');
      return job(callbacks).then((blob) => {
        callbacks.onVerify?.(renderHarness.failedVerifyReport);
        return blob;
      });
    }
  },
}));

vi.mock('./localOutput', () => {
  class DirectorLocalOutputUnavailableError extends Error {}
  return {
    DirectorLocalOutputUnavailableError,
    saveDirectorLocalOutput: async (output: Blob, title: string) => {
      localOutputHarness.saved.push({ bytes: output.size, title });
      const next = localOutputHarness.paths.shift()
        ?? '/Users/test/Movies/Director/Studio-test-20260727-120000-ffmpeg.mp4';
      if (next instanceof Error) throw next;
      return {
        ok: true,
        backend: 'ffmpeg',
        outputPath: next,
        outputBytes: output.size,
      };
    },
    revealDirectorLocalOutput: async (outputPath: string) => {
      localOutputHarness.revealed.push(outputPath);
    },
  };
});

vi.mock('./adobeEffectPlates', () => ({
  prepareDirectorAdobeHandoff: async () => ({
    plan: {},
    planName: 'Studio-test.director-adobe.json',
    planJson: '{}',
    media: [],
    totalBytes: 10,
  }),
}));

vi.mock('./adobeHandoff', () => {
  class DirectorLocalAdobeUnavailableError extends Error {}
  return {
    DirectorLocalAdobeUnavailableError,
    adobeHandoffArchiveName: () => 'Studio-test.director-adobe.zip',
    sendDirectorAdobeHandoffToLocalService: async () => {
      const next = adobeHarness.results.shift();
      if (!next) throw new Error('Missing Adobe handoff test result.');
      return next;
    },
    zipDirectorAdobeHandoff: async () => new Blob(['archive'], { type: 'application/zip' }),
  };
});

const initialProject: ReelProject = {
  id: 'reel-1', title: 'Studio test', aspectRatio: '9:16', fps: 24, quality: 'draft',
  selectedClipIds: ['clip-1'], audio: null, renderRequested: false,
  clips: [{
    id: 'clip-1', objectId: 'reference-1', title: 'Quiet Resolve', imageUrl: 'blob:local-studio-reference',
    duration: 2, effect: 'clean', transition: 'cut', transitionDuration: 0,
    motion: 'still', intensity: 50, textLayers: [],
  }],
};

function Harness({ initial = initialProject }: { initial?: ReelProject }) {
  const [project, setProject] = useState(initial);
  return <><DirectorReelStudio project={project} onChange={setProject} onClose={vi.fn()} /><output data-testid="project-state">{JSON.stringify(project)}</output></>;
}

function chooseOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: new RegExp(`^${option}\\b`) }));
}

/** The registry-driven PluginPicker uses a plain button trigger + button items. */
function choosePluginOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.click(screen.getByText(option));
}

describe('Director Reel Studio render transactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    renderHarness.jobs.length = 0;
    renderHarness.cancellations = 0;
    localOutputHarness.paths.length = 0;
    localOutputHarness.saved.length = 0;
    localOutputHarness.revealed.length = 0;
    adobeHarness.results.length = 0;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:render-output');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it.each([
    ['empty timeline', { ...initialProject, clips: [], selectedClipIds: [] }],
    ['active project', initialProject],
  ])('shows the single Director wordmark and preserves the project title for an %s', (_state, project) => {
    render(<Harness initial={project} />);

    expect(screen.getByText('DIRECTOR', { selector: '.reel-studio-title' })).toBeInTheDocument();
    expect(screen.queryByText('DIRECTOR V2 · LOCAL EDIT ENGINE')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: project.title })).not.toBeInTheDocument();
    expect(screen.getByText('Media stays on this device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to direction board' })).toBeInTheDocument();
    expect((JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject).title).toBe(project.title);
  });

  it('invalidates a completed download as soon as the visible edit changes', async () => {
    renderHarness.jobs.push(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Render on this device' }));
    expect(await screen.findByRole('link', { name: 'Download copy' })).toBeInTheDocument();
    expect(screen.getByText('Export checks found issues')).toBeInTheDocument();

    chooseOption('Quality', 'Balanced');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Download copy' })).not.toBeInTheDocument());
    expect(screen.queryByText('Export checks found issues')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Render on this device' })).toBeEnabled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:render-output');
  });

  it('keeps retry disabled until cancellation settles, then renders successfully', async () => {
    let rejectFirst: (error: Error) => void = () => undefined;
    renderHarness.jobs.push(() => new Promise<Blob>((_, reject) => { rejectFirst = reject; }));
    renderHarness.jobs.push(async () => new Blob([new Uint8Array([4, 5, 6])], { type: 'video/mp4' }));
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Render on this device' }));
    const cancel = await screen.findByRole('button', { name: 'Cancel render' });
    fireEvent.click(cancel);
    expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled();
    rejectFirst(new Error('Render cancelled.'));

    const retry = await screen.findByRole('button', { name: 'Render on this device' });
    fireEvent.click(retry);
    expect(await screen.findByRole('link', { name: 'Download copy' })).toBeInTheDocument();
    expect(renderHarness.cancellations).toBeGreaterThanOrEqual(2);
  });

  it('shows frame progress instead of looking frozen during a heavy render', async () => {
    renderHarness.jobs.push(async (callbacks) => {
      callbacks?.onStage('rendering', 'Compatibility render');
      callbacks?.onLog?.('frame=   24 fps=0.8 size=0kB time=00:00:01.00');
      return new Promise<Blob>(() => undefined);
    });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Render on this device' }));
    expect(await screen.findByText(/Rendering frame 24\/48 · 50%/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Local render progress' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('warns before a low-tier heavy render and switches to High only when asked', () => {
    const heavyDraft: ReelProject = {
      ...initialProject,
      quality: 'draft',
      clips: [{ ...initialProject.clips[0], visualEffect: 'pixel-sort', visualEffectStack: ['pixel-sort'] }],
    };
    render(<Harness initial={heavyDraft} />);

    fireEvent.click(screen.getByRole('button', { name: 'Render on this device' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Heavy visual effects need High or Maximum to look right');
    expect(screen.getByRole('alert')).toHaveTextContent('Draft will soften pixel-sort and grain texture');
    expect((JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject).quality).toBe('draft');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to High' }));
    expect((JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject).quality).toBe('high');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('allows the user to keep the chosen preview tier after the texture warning', async () => {
    renderHarness.jobs.push(async () => new Blob([new Uint8Array([8, 9, 10])], { type: 'video/mp4' }));
    const heavyBalanced: ReelProject = {
      ...initialProject,
      quality: 'balanced',
      clips: [{ ...initialProject.clips[0], visualEffect: 'pixel-sort', visualEffectStack: ['pixel-sort'] }],
    };
    render(<Harness initial={heavyBalanced} />);

    fireEvent.click(screen.getByRole('button', { name: 'Render on this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Render Balanced anyway' }));
    expect(await screen.findByRole('link', { name: 'Download copy' })).toBeInTheDocument();
    expect((JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject).quality).toBe('balanced');
  });

  it('replaces the Adobe reveal target with the newly saved FFmpeg output', async () => {
    const adobePath = '/Users/test/Movies/Director/Studio-test-20260727-120000-adobe.mp4';
    const ffmpegPath = '/Users/test/Movies/Director/Studio-test-20260727-120100-ffmpeg.mp4';
    adobeHarness.results.push({
      ok: true,
      packagePath: null,
      planPath: null,
      outputPath: adobePath,
      outputBytes: 12,
      configPath: '/Users/test/Projects/conductor/conductor.config.json',
      adobe: {
        status: 'rendered',
        receipt: { deliveryCodec: 'hevc-main10', deliveryBitDepth: 10 },
      },
    });
    localOutputHarness.paths.push(ffmpegPath);
    renderHarness.jobs.push(async () => (
      new Blob([new Uint8Array([4, 5, 6])], { type: 'video/mp4' })
    ));
    render(<Harness initial={{
      ...initialProject,
      quality: 'high',
      renderBackend: 'after-effects',
      colorDepth: 32,
    }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Render with After Effects' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show output' }));
    expect(localOutputHarness.revealed).toEqual([adobePath]);

    chooseOption('Render engine', 'FFmpeg');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Show output' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Render on this device' }));
    expect(await screen.findByText(/FFmpeg output saved and verified/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show output' }));

    expect(localOutputHarness.saved).toEqual([{ bytes: 3, title: 'Studio test' }]);
    expect(localOutputHarness.revealed).toEqual([adobePath, ffmpegPath]);
  });

  it('keeps the browser download when automatic FFmpeg saving fails', async () => {
    localOutputHarness.paths.push(new Error('Disk unavailable'));
    renderHarness.jobs.push(async () => (
      new Blob([new Uint8Array([7, 8, 9])], { type: 'video/mp4' })
    ));
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Render on this device' }));

    expect(await screen.findByRole('link', { name: 'Download MP4' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show output' })).not.toBeInTheDocument();
    expect(screen.getByText(/automatic saving failed/i)).toBeInTheDocument();
  });

  it('discards a render that finishes after the visible timeline changed', async () => {
    let resolveRender: (blob: Blob) => void = () => undefined;
    renderHarness.jobs.push(() => new Promise<Blob>((resolve) => { resolveRender = resolve; }));
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Render on this device' }));
    await screen.findByRole('button', { name: 'Cancel render' });
    chooseOption('Quality', 'Balanced');
    resolveRender(new Blob([new Uint8Array([7, 8, 9])], { type: 'video/mp4' }));

    expect(await screen.findByText(/older output was discarded/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download copy' })).not.toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('supports additive timeline selection and applies manual controls to every selected clip', () => {
    const second = {
      ...initialProject.clips[0],
      id: 'clip-2',
      title: 'Brutalist Silver',
      transition: 'crossfade' as const,
      transitionDuration: 0.4,
    };
    render(<Harness initial={{ ...initialProject, clips: [...initialProject.clips, second] }} />);
    fireEvent.click(screen.getByTestId('timeline-clip-clip-2'), { ctrlKey: true });
    chooseOption('Color grade', 'Warm');
    const state = JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject;
    expect(state.selectedClipIds).toEqual(['clip-1', 'clip-2']);
    expect(state.clips.map((clip) => clip.effect)).toEqual(['warm', 'warm']);
  });

  it('keeps visual effects separate from the color grade', () => {
    render(<Harness />);
    chooseOption('Visual effect', 'Pixel sort');
    const state = JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject;
    expect(state.clips[0]).toMatchObject({ effect: 'clean', visualEffect: 'pixel-sort' });
  });

  it('stacks multiple visual effects in an explicit render order', () => {
    render(<Harness />);
    chooseOption('Visual effect', 'Pixel sort');
    fireEvent.click(screen.getByRole('button', { name: 'Add visual effect layer' }));
    fireEvent.click(screen.getByRole('option', { name: /^CRT scan\b/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add visual effect layer' }));
    fireEvent.click(screen.getByRole('option', { name: /^Motion echo\b/ }));
    const state = JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject;
    expect(state.clips[0]).toMatchObject({
      visualEffect: 'pixel-sort',
      visualEffectStack: ['pixel-sort', 'crt-scan', 'motion-echo'],
    });
    expect(screen.getByLabelText('Visual effect layers')).toHaveTextContent('Pixel sort');
    expect(screen.getByLabelText('Visual effect layers')).toHaveTextContent('CRT scan');
    expect(screen.getByLabelText('Visual effect layers')).toHaveTextContent('Motion echo');
  });

  it('applies a three-effect stack that includes the migrated halftone reference plugin', () => {
    render(<Harness />);
    chooseOption('Visual effect', 'Halftone reveal');
    fireEvent.click(screen.getByRole('button', { name: 'Add visual effect layer' }));
    fireEvent.click(screen.getByRole('option', { name: /^CRT scan\b/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add visual effect layer' }));
    fireEvent.click(screen.getByRole('option', { name: /^Motion echo\b/ }));

    const state = JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject;
    expect(state.clips[0]).toMatchObject({
      visualEffect: 'halftone-reveal',
      visualEffectStack: ['halftone-reveal', 'crt-scan', 'motion-echo'],
    });
    expect(screen.getByLabelText('Visual effect layers')).toHaveTextContent('Halftone reveal');
    expect(screen.getByText('Strength')).toBeInTheDocument();
  });

  it('moves a clip earlier through the timeline controls', () => {
    const second = {
      ...initialProject.clips[0],
      id: 'clip-2',
      title: 'Brutalist Silver',
      transition: 'crossfade' as const,
      transitionDuration: 0.4,
    };
    render(<Harness initial={{ ...initialProject, clips: [...initialProject.clips, second] }} />);

    fireEvent.click(screen.getAllByTitle('Move earlier')[1]);

    const state = JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject;
    expect(state.clips.map((clip) => clip.id)).toEqual(['clip-2', 'clip-1']);
    expect(state.clips[0]).toMatchObject({ transition: 'cut', transitionDuration: 0 });
  });

  it('uses a non-first clip as the transition inspector source for select all', () => {
    const second = {
      ...initialProject.clips[0],
      id: 'clip-2',
      title: 'Brutalist Silver',
      transition: 'crossfade' as const,
      transitionDuration: 0.4,
    };
    render(<Harness initial={{ ...initialProject, clips: [...initialProject.clips, second] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    choosePluginOption('Transition', 'Dip to black');
    fireEvent.change(screen.getByLabelText('Blend'), { target: { value: '0.6' } });
    const state = JSON.parse(screen.getByTestId('project-state').textContent || '{}') as ReelProject;
    expect(state.clips[0]).toMatchObject({ transition: 'cut', transitionDuration: 0 });
    expect(state.clips[1]).toMatchObject({ transition: 'dip-black', transitionDuration: 0.6 });
  });
});
