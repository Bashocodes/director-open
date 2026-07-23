import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));

vi.mock('../../lib/api', () => ({ api: { get: mocks.apiGet, post: mocks.apiPost } }));

vi.mock('./components/DirectorCanvas', () => ({
  DirectorCanvas: (props: Record<string, any>) => (
    <div>
      <div data-testid="canvas-titles">{props.objects.map((object: { title: string }) => object.title).join('|')}</div>
      <button type="button" onClick={() => props.onUploadFiles([
        new File(['one'], 'Local One.png', { type: 'image/png' }),
        new File(['two'], 'Local Two.webp', { type: 'image/webp' }),
      ])}>Upload two images</button>
      <button type="button" disabled={!props.objects[1]} onClick={() => props.onSelectionChange([props.objects[1].id])}>Select second image</button>
      <button type="button" onClick={() => props.onModeChange('animate')}>Animate selection</button>
    </div>
  ),
}));

vi.mock('./components/DirectorChat', () => ({
  DirectorChat: (props: Record<string, any>) => (
    <div>
      <div data-testid="chat-messages">{props.messages.map((message: { text: string }) => message.text).join('|')}</div>
      <div data-testid="director-model">{props.model}</div>
      <button type="button" onClick={() => props.onSend('Compile this direction')}>Send direction request</button>
      <button type="button" onClick={() => props.onSend('okay now make a reel')}>Make reel request</button>
      <button type="button" onClick={() => props.onModelChange('gpt-5.4-mini')}>Choose GPT-5.4 mini</button>
      <button type="button" onClick={props.onNewProject}>Start new project</button>
    </div>
  ),
}));

vi.mock('./reel/DirectorReelStudio', () => ({
  DirectorReelStudio: (props: Record<string, any>) => <div data-testid="reel-studio">
    {props.project.clips.length} reel clips · {props.project.clips.map((clip: { title: string }) => clip.title).join('|')}
    <span data-testid="reel-effects">{props.project.clips.map((clip: { visualEffect?: string }) => clip.visualEffect).join('|')}</span>
  </div>,
}));

import { DirectorPage } from './DirectorPage';

describe('DirectorPage canvas-aware chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file: File) => `blob:https://director.test/${encodeURIComponent(file.name)}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    mocks.apiGet.mockResolvedValue({
      ok: true,
      provider: 'openai',
      geminiConfigured: true,
      openaiConfigured: true,
      demoEnabled: true,
    });
    mocks.apiPost.mockResolvedValue({
      ok: true,
      response: {
        message: 'Direction is ready.', mode: 'inherit', directionContract: null, sequence: null,
        continuity: null, canvasActions: [], reelActions: [], suggestedActions: [],
      },
      model: 'gpt-5.4',
      canvasActionResults: [],
    });
  });

  it('defaults fresh and newly reset projects to GPT-5.4', () => {
    render(<DirectorPage />);
    expect(screen.getByTestId('director-model')).toHaveTextContent('gpt-5.4');
    fireEvent.click(screen.getByText('Choose GPT-5.4 mini'));
    expect(screen.getByTestId('director-model')).toHaveTextContent('gpt-5.4-mini');
    fireEvent.click(screen.getByText('Start new project'));
    expect(screen.getByTestId('director-model')).toHaveTextContent('gpt-5.4');
  });

  it('turns local image uploads into canvas objects', () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    expect(screen.getByTestId('canvas-titles')).toHaveTextContent('Local One|Local Two');
  });

  it('keeps retired corpus context empty in model requests', async () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    fireEvent.click(screen.getByText('Send direction request'));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalled());
    expect(mocks.apiPost.mock.calls[0][1].context.visibleSearch).toBeNull();
  });

  it('opens a real reel timeline when the provider returns prose but omits reel actions', async () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    mocks.apiPost.mockResolvedValueOnce({
      ok: true,
      response: {
        message: 'I initialized the kinetic timeline translation.', mode: 'animate',
        directionContract: null, sequence: null, continuity: null,
        canvasActions: [], reelActions: [], suggestedActions: [],
      },
      model: 'gpt-5.4',
      canvasActionResults: [],
    });
    fireEvent.click(screen.getByText('Make reel request'));
    expect(await screen.findByTestId('reel-studio')).toHaveTextContent('2 reel clips');
  });

  it('restores canvas data after the page is remounted', async () => {
    const view = render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    await waitFor(() => expect(window.localStorage.getItem('director-open.active-project.v1')).toContain('Local One'), { timeout: 1_500 });
    view.unmount();
    render(<DirectorPage />);
    expect(screen.getByTestId('canvas-titles')).toHaveTextContent('Local One|Local Two');
  });

  it('restores retired visual effects as canonical state and renders the migration receipt', () => {
    window.localStorage.setItem('director-open.active-project.v1', JSON.stringify({
      version: 1,
      sessionId: 'director-legacy-session',
      updatedAt: '2026-07-21T12:00:00.000Z',
      title: 'Legacy effects',
      objects: [],
      selectedIds: [],
      mode: 'animate',
      goal: 'Restore the timeline.',
      exclusions: [],
      contract: null,
      sequence: null,
      continuity: null,
      reelProject: {
        id: 'legacy-reel', title: 'Legacy effects', aspectRatio: '9:16', fps: 24, quality: 'high',
        clips: [{
          id: 'legacy-clip', objectId: null, title: 'Legacy portrait', imageUrl: '/demo/one.jpg',
          duration: 3.2, effect: 'clean', visualEffect: 'rgb-split',
          visualEffectStack: ['rgb-split', 'glow'], transition: 'cut', transitionDuration: 0,
          motion: 'still', intensity: 60, caption: '',
        }],
        selectedClipIds: ['legacy-clip'], audio: null, renderRequested: false,
      },
      reelOpen: true,
      visibleSearch: null,
      messages: [{ id: 'welcome', role: 'assistant', text: 'Welcome.' }],
      model: 'gemini-3.5-flash',
      localMediaOmitted: 0,
    }));

    render(<DirectorPage />);
    expect(screen.getByTestId('reel-effects')).toHaveTextContent('glitch-burst');
    expect(screen.getByTestId('chat-messages')).toHaveTextContent('RGB split is now Glitch burst.');
    expect(screen.getByTestId('chat-messages')).toHaveTextContent('Soft glow was retired');
  });

  it('replaces an old timeline with the image currently selected on the canvas', async () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    fireEvent.click(screen.getByText('Select second image'));
    fireEvent.click(screen.getByText('Animate selection'));
    expect(await screen.findByTestId('reel-studio')).toHaveTextContent('1 reel clips · Local Two');
  });

  it('opens Animate with an empty timeline so local images can be added directly', async () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Animate selection'));
    expect(await screen.findByTestId('reel-studio')).toHaveTextContent('0 reel clips');
  });
});
