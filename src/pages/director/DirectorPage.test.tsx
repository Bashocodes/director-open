import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ providerStream: vi.fn() }));

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

vi.mock('../../lib/ai/providers', () => ({
  getChatProvider: () => ({ stream: mocks.providerStream }),
}));

vi.mock('./components/DirectorCanvas', () => ({
  DirectorCanvas: (props: Record<string, any>) => (
    <div>
      <div data-testid="canvas-titles">{props.objects.map((object: { title: string }) => object.title).join('|')}</div>
      <div data-testid="canvas-media">{props.objects.map((object: {
        imageUrl?: string;
        sourceFile?: File;
      }) => `${object.imageUrl || 'none'}:${object.sourceFile?.name || 'none'}`).join('|')}</div>
      <div data-testid="canvas-positions">{props.objects.map((object: {
        position: { x: number; y: number };
      }) => `${object.position.x},${object.position.y}`).join('|')}</div>
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
      <div data-testid="director-provider">
        {props.aiSettings.selectedProvider}:{props.aiSettings.providers[props.aiSettings.selectedProvider].model}
      </div>
      <div data-testid="persistence-status">{props.persistenceStatus}</div>
      <div data-testid="pending-proposal">{props.pendingProposal ? 'pending' : 'clear'}</div>
      <div data-testid="chat-collapsed">{props.collapsed ? 'collapsed' : 'expanded'}</div>
      <div data-testid="chat-unread">{props.unread ? 'unread' : 'clear'}</div>
      <button type="button" onClick={props.onToggleCollapse}>Toggle collapse</button>
      <button type="button" onClick={() => props.onSend('Compile this direction')}>Send direction request</button>
      <button type="button" onClick={() => props.onSend('okay now make a reel')}>Make reel request</button>
      <button type="button" disabled={!props.pendingProposal} onClick={props.onApplyProposal}>Apply proposal</button>
      <button type="button" disabled={!props.pendingProposal} onClick={props.onDiscardProposal}>Discard proposal</button>
      <button type="button" onClick={props.onNewProject}>Start new project</button>
      <button type="button" onClick={props.onExportProject}>Export project JSON</button>
      <label>
        Import project JSON
        <input
          type="file"
          aria-label="Import project JSON file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onImportProject(file);
          }}
        />
      </label>
      {props.projectFileNotice && <div role="status">{props.projectFileNotice}</div>}
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
    window.localStorage.setItem('director-open.ai-settings.v1', JSON.stringify({
      version: 1,
      selectedProvider: 'openai',
      providers: {
        openai: { apiKey: 'browser-test-key', model: 'gpt-5.6' },
        anthropic: { apiKey: '', model: 'claude-sonnet-5' },
        google: { apiKey: '', model: 'gemini-3.6-flash' },
        custom: { apiKey: '', model: 'qwen3', baseUrl: 'http://127.0.0.1:11434/v1' },
      },
    }));
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((file: File) => `blob:https://director.test/${encodeURIComponent(file.name)}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    mocks.providerStream.mockImplementation(async function* () {
      yield 'Direction is ready.\nDIRECTOR_ACTIONS_JSON\n[]';
    });
  });

  it('lights the unread dot when a streamed reply finishes while the chat is collapsed', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.providerStream.mockImplementation(async function* () {
      yield 'Working…';
      await gate; // hold the stream open so we can collapse mid-reply
      yield '\nDIRECTOR_ACTIONS_JSON\n[]';
    });
    render(<DirectorPage />);

    // Reply is created while expanded (composer only exists then).
    fireEvent.click(screen.getByText('Send direction request'));
    // User collapses mid-stream — no new message id is produced.
    fireEvent.click(screen.getByText('Toggle collapse'));
    expect(screen.getByTestId('chat-collapsed')).toHaveTextContent('collapsed');
    expect(screen.getByTestId('chat-unread')).toHaveTextContent('clear');

    // Completing the reply while collapsed must light the unread dot.
    release();
    await waitFor(() => expect(screen.getByTestId('chat-unread')).toHaveTextContent('unread'));
  });

  it('uses browser vault provider settings and keeps them across project resets', () => {
    render(<DirectorPage />);
    expect(screen.getByTestId('director-provider')).toHaveTextContent('openai:gpt-5.6');
    fireEvent.click(screen.getByText('Start new project'));
    expect(screen.getByTestId('director-provider')).toHaveTextContent('openai:gpt-5.6');
  });

  it('turns local image uploads into canvas objects', () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    expect(screen.getByTestId('canvas-titles')).toHaveTextContent('Local One|Local Two');
    expect(screen.getByTestId('canvas-positions')).toHaveTextContent('560,220|950,220');
  });

  it('exports strict project JSON without browser media URLs or provider keys and revokes the download URL', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<DirectorPage />);

    fireEvent.click(screen.getByText('Export project JSON'));

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const jsonBlob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(jsonBlob.type).toBe('application/json');
    const contents = await readBlob(jsonBlob);
    expect(contents).toContain('"version": 2');
    expect(contents).not.toContain('browser-test-key');
    expect(contents).not.toContain('blob:');
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/\.director\.json$/);
    expect(anchor.isConnected).toBe(false);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      'blob:https://director.test/undefined',
    ));
  });

  it('leaves the active project untouched when imported JSON is invalid', async () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    vi.mocked(URL.revokeObjectURL).mockClear();

    fireEvent.change(screen.getByLabelText('Import project JSON file'), {
      target: {
        files: [new File(['{"version":1}'], 'broken.director.json', { type: 'application/json' })],
      },
    });

    expect(await screen.findByRole('status')).toHaveTextContent('current project was not changed');
    expect(screen.getByTestId('canvas-titles')).toHaveTextContent('Local One|Local Two');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('reconnects same-session browser media by stable ids when importing an edited project file', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    fireEvent.click(screen.getByText('Export project JSON'));
    const jsonBlob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0] as Blob;
    const exported = JSON.parse(await readBlob(jsonBlob));
    exported.objects[0].title = 'Edited by MCP';
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
    vi.mocked(URL.revokeObjectURL).mockClear();

    fireEvent.change(screen.getByLabelText('Import project JSON file'), {
      target: {
        files: [new File(
          [JSON.stringify(exported)],
          'edited.director.json',
          { type: 'application/json' },
        )],
      },
    });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      'reconnected by stable ids',
    ));
    expect(screen.getByTestId('canvas-titles')).toHaveTextContent('Edited by MCP|Local Two');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('drops unresolved file media at the browser boundary and reports what must be added again', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    fireEvent.click(screen.getByText('Export project JSON'));
    const jsonBlob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0] as Blob;
    const exported = JSON.parse(await readBlob(jsonBlob));
    exported.sessionId = 'different-director-session';
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled());
    vi.mocked(URL.revokeObjectURL).mockClear();

    fireEvent.change(screen.getByLabelText('Import project JSON file'), {
      target: {
        files: [new File(
          [JSON.stringify(exported)],
          'detached.director.json',
          { type: 'application/json' },
        )],
      },
    });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(
      '2 local media items need to be added again',
    ));
    expect(screen.getByTestId('canvas-titles')).toHaveTextContent('Local One|Local Two');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://director.test/Local%20One.png');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://director.test/Local%20Two.webp');
  });

  it('serializes canvas awareness without local media names or bytes', async () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    fireEvent.click(screen.getByText('Send direction request'));
    await waitFor(() => expect(mocks.providerStream).toHaveBeenCalled());
    const request = mocks.providerStream.mock.calls[0][0];
    expect(request.systemPrompt).toContain('director-canvas-context-v1');
    expect(request.systemPrompt).toContain('"selected":true');
    expect(request.systemPrompt).not.toContain('Local One');
    expect(request.systemPrompt).not.toContain('blob:');
    expect(request.apiKey).toBe('browser-test-key');
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'Compile this direction' });
  });

  it('does not mutate until a validated reel proposal is explicitly applied', async () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByText('Upload two images'));
    mocks.providerStream.mockImplementationOnce(async function* () {
      yield 'I can add the selected images to a reel.\nDIRECTOR_ACTIONS_JSON\n';
      yield JSON.stringify([{
        type: 'add_clips',
        objectIds: [],
        clipIds: [],
        aspectRatio: null,
        fps: null,
        quality: null,
        effect: null,
        visualEffect: null,
        transition: null,
        motion: null,
        duration: null,
        intensity: null,
        layerId: null,
        content: null,
        textX: null,
        textY: null,
        fontId: null,
        sizePreset: null,
        textColor: null,
        align: null,
        inSec: null,
        outSec: null,
      }]);
    });
    fireEvent.click(screen.getByText('Make reel request'));
    await waitFor(() => expect(screen.getByTestId('pending-proposal')).toHaveTextContent('pending'));
    expect(screen.queryByTestId('reel-studio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Apply proposal'));
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

  it('rehydrates uploaded image files from IndexedDB after a refresh boundary', async () => {
    const view = render(<DirectorPage />);
    await waitFor(() => expect(screen.getByTestId('persistence-status')).toHaveTextContent('saved'));
    fireEvent.click(screen.getByText('Upload two images'));
    await waitFor(() => expect(screen.getByTestId('persistence-status')).toHaveTextContent('saving'));
    await waitFor(
      () => expect(screen.getByTestId('persistence-status')).toHaveTextContent('saved'),
      { timeout: 2_000 },
    );

    view.unmount();
    render(<DirectorPage />);

    await waitFor(() => {
      expect(screen.getByTestId('canvas-media')).toHaveTextContent(
        'blob:https://director.test/Local%20One.png:Local One.png',
      );
      expect(screen.getByTestId('canvas-media')).toHaveTextContent(
        'blob:https://director.test/Local%20Two.webp:Local Two.webp',
      );
    });
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
          id: 'legacy-clip', objectId: null, title: 'Legacy portrait', imageUrl: 'data:image/png;base64,AA==',
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
