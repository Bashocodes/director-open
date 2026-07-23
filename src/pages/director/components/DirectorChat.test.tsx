import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../../lib/ai/vault';
import { DirectorChat } from './DirectorChat';

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

function directorChatProps(overrides: Partial<ComponentProps<typeof DirectorChat>> = {}): ComponentProps<typeof DirectorChat> {
  const aiSettings: AiSettings = structuredClone(DEFAULT_AI_SETTINGS);
  aiSettings.providers.openai.apiKey = 'test-key';
  return {
    messages: [],
    busy: false,
    selectedCount: 0,
    objectCount: 0,
    referenceCount: 0,
    hasContract: false,
    hasSequence: false,
    hasReel: false,
    reelOpen: false,
    aiSettings,
    pendingProposal: null,
    history: [],
    historyOpen: false,
    persistenceStatus: 'saved',
    projectFileNotice: '',
    onAiSettingsChange: vi.fn(),
    onApplyProposal: vi.fn(),
    onDiscardProposal: vi.fn(),
    onSend: vi.fn(),
    onNewProject: vi.fn(),
    onExportProject: vi.fn(),
    onImportProject: vi.fn(),
    onToggleHistory: vi.fn(),
    onRestoreHistory: vi.fn(),
    onDeleteHistory: vi.fn(),
    ...overrides,
  };
}

describe('Director browser-direct AI controls', () => {
  it('shows all four providers and switches the browser-selected provider', () => {
    const onAiSettingsChange = vi.fn();
    render(<DirectorChat {...directorChatProps({ onAiSettingsChange })} />);

    const selector = screen.getByRole('combobox', { name: 'AI provider' }) as HTMLSelectElement;
    expect([...selector.options].map(({ value, text }) => [value, text])).toEqual([
      ['openai', 'OpenAI'],
      ['anthropic', 'Anthropic'],
      ['google', 'Gemini'],
      ['custom', 'Custom / local'],
    ]);
    expect(selector.value).toBe('openai');
    expect(screen.getByText('gpt-5.6 · browser direct')).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'custom' } });
    expect(onAiSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ selectedProvider: 'custom' }));
  });

  it('shows a friendly setup state and keeps the editor available when no key exists', () => {
    const aiSettings = structuredClone(DEFAULT_AI_SETTINGS);
    render(<DirectorChat {...directorChatProps({ aiSettings })} />);

    expect(screen.getByText('Set up an AI provider')).toBeInTheDocument();
    const status = screen.getByText('AI SETUP NEEDED');
    expect(status).toHaveClass('provider-status', 'unconfigured');
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('reports a browser quota failure without claiming media was saved', () => {
    render(<DirectorChat {...directorChatProps({ persistenceStatus: 'quota' })} />);

    const status = screen.getByRole('alert');
    expect(status).toHaveTextContent('storage full · media not saved');
    expect(status).toHaveAttribute('title', expect.stringContaining('Browser storage is full'));
  });

  it('exposes accessible project JSON import and export controls', () => {
    const onExportProject = vi.fn();
    const onImportProject = vi.fn();
    render(<DirectorChat {...directorChatProps({ onExportProject, onImportProject })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export project JSON' }));
    expect(onExportProject).toHaveBeenCalledOnce();

    const file = new File(['{"version":1}'], 'director-project.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('Project JSON file'), {
      target: { files: [file] },
    });
    expect(onImportProject).toHaveBeenCalledWith(file);
  });

  it('shows project file feedback outside the persisted conversation', () => {
    render(<DirectorChat {...directorChatProps({
      projectFileNotice: 'That file is not a valid Director project. The current project was not changed.',
    })} />);

    expect(screen.getByRole('status')).toHaveTextContent('current project was not changed');
  });

  it('requires an explicit Apply or Discard decision for proposed actions', () => {
    const onApplyProposal = vi.fn();
    const onDiscardProposal = vi.fn();
    render(<DirectorChat {...directorChatProps({
      pendingProposal: {
        explanation: 'Update the goal.',
        actions: [{
          type: 'set_goal',
          query: null,
          count: null,
          objectIds: [],
          objectId: null,
          channels: [],
          goal: 'A tighter reel.',
          exclusions: [],
        }],
      },
      onApplyProposal,
      onDiscardProposal,
    })} />);

    expect(screen.getByRole('article', { name: 'Apply these edits' })).toHaveTextContent('Update the creative goal');
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApplyProposal).toHaveBeenCalledOnce();
    expect(onDiscardProposal).not.toHaveBeenCalled();
  });
});
