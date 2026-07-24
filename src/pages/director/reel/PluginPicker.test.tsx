import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PluginPicker } from './PluginPicker';

describe('PluginPicker', () => {
  it('lists registry transitions grouped, and reflects the current value', () => {
    render(<PluginPicker label="Transition" kind="transition" value="cut" onChange={vi.fn()} />);
    // Trigger's accessible name is the field label; its text shows the value.
    const trigger = screen.getByRole('button', { name: 'Transition' });
    expect(trigger).toHaveTextContent('Cut');
    fireEvent.click(trigger);
    // Auto-discovered per-pixel transitions appear under their group.
    expect(screen.getByText('Cinematic')).toBeInTheDocument();
    expect(screen.getByText('Ripple dissolve')).toBeInTheDocument();
    expect(screen.getByText('Glitch cut')).toBeInTheDocument();
  });

  it('searches by name/description', () => {
    render(<PluginPicker label="Transition" kind="transition" value="cut" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Transition' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Transition' }), { target: { value: 'ripple' } });
    expect(screen.getByText('Ripple dissolve')).toBeInTheDocument();
    expect(screen.queryByText('Glitch cut')).not.toBeInTheDocument();
  });

  it('selects a transition on click', () => {
    const onChange = vi.fn();
    render(<PluginPicker label="Transition" kind="transition" value="cut" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Transition' }));
    fireEvent.click(screen.getByText('Liquid melt'));
    expect(onChange).toHaveBeenCalledWith('liquid-melt');
  });

  it('is keyboard navigable — arrow + enter select', () => {
    const onChange = vi.fn();
    render(<PluginPicker label="Camera move" kind="motion" value="still" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Camera move' }));
    const dialog = screen.getByRole('dialog', { name: 'Camera move picker' });
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    // The second flat item (index 1) was chosen — not the already-selected first.
    expect(onChange.mock.calls[0][0]).not.toBe('still');
  });
});
