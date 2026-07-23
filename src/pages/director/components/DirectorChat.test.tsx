import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { DirectorChat } from './DirectorChat';

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

function directorChatProps(overrides: Partial<ComponentProps<typeof DirectorChat>> = {}): ComponentProps<typeof DirectorChat> {
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
    model: 'gpt-5.4',
    history: [],
    historyOpen: false,
    persistenceStatus: 'saved',
    providerStatus: { mode: 'openai', geminiConfigured: true, openaiConfigured: true, demoEnabled: true },
    onModelChange: vi.fn(),
    onSend: vi.fn(),
    onNewProject: vi.fn(),
    onToggleHistory: vi.fn(),
    onRestoreHistory: vi.fn(),
    onDeleteHistory: vi.fn(),
    ...overrides,
  };
}

describe('Director model selector', () => {
  it('shows the requested three-model roster in order with GPT-5.4 selected', () => {
    const onModelChange = vi.fn();
    render(<DirectorChat {...directorChatProps({ onModelChange })} />);

    const selector = screen.getByRole('combobox', { name: 'Director model' }) as HTMLSelectElement;
    expect([...selector.options].map(({ value, text }) => [value, text])).toEqual([
      ['gpt-5.4', 'GPT-5.4'],
      ['gpt-5.4-mini', 'GPT-5.4 MINI'],
      ['gemini-3.5-flash', 'GEMINI 3.5 FLASH'],
    ]);
    expect(selector.value).toBe('gpt-5.4');
    expect(screen.getByText('OPENAI CONNECTED')).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'gpt-5.4-mini' } });
    expect(onModelChange).toHaveBeenCalledWith('gpt-5.4-mini');
  });

  it('does not show an unavailable selected provider as connected', () => {
    render(<DirectorChat {...directorChatProps({
      providerStatus: { mode: 'gemini', geminiConfigured: true, openaiConfigured: false, demoEnabled: false },
    })} />);

    const status = screen.getByText('MODEL NOT CONFIGURED');
    expect(status).toHaveClass('provider-status', 'unconfigured');
    expect(status).not.toHaveClass('gemini');
  });

  it('shows the enabled demo fallback when the selected provider key is missing', () => {
    render(<DirectorChat {...directorChatProps({
      providerStatus: { mode: 'gemini', geminiConfigured: true, openaiConfigured: false, demoEnabled: true },
    })} />);

    expect(screen.getByText('DEMO FALLBACK · KEY NEEDED')).toHaveClass('provider-status', 'demo');
  });
});
