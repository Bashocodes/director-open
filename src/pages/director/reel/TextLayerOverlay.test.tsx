import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTextLayer } from '../../../shared/textLayers';
import { TextLayerOverlay } from './TextLayerOverlay';

const layer = createTextLayer('t-1', { content: 'HELLO WORLD LONG', clipDuration: 5, x: 0.5, y: 0.5 });

function renderOverlay(overrides: Partial<Parameters<typeof TextLayerOverlay>[0]> = {}) {
  const props = {
    layers: [layer],
    selectedLayerId: 't-1',
    onSelect: vi.fn(),
    onChange: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const view = render(<TextLayerOverlay {...props} />);
  return { ...view, props };
}

describe('TextLayerOverlay', () => {
  it('selects a layer on click', () => {
    const { props } = renderOverlay({ selectedLayerId: null });
    fireEvent.click(screen.getByRole('button', { name: /Text layer/ }));
    expect(props.onSelect).toHaveBeenCalledWith('t-1');
  });

  it('snaps to the horizontal/vertical centre while dragging', () => {
    const { container, props } = renderOverlay({ layers: [{ ...layer, x: 0.2, y: 0.2 }] });
    const root = container.querySelector('.text-overlay') as HTMLElement;
    root.setPointerCapture = vi.fn();
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const handle = screen.getByRole('button', { name: /Text layer/ });
    handle.setPointerCapture = vi.fn();

    fireEvent.pointerDown(handle, { pointerId: 1 });
    // Drop near the centre (505,498) → should snap to exactly 0.5/0.5.
    fireEvent.pointerMove(root, { pointerId: 1, clientX: 505, clientY: 498 });
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ x: 0.5, y: 0.5 }));
    // Snap guides appear.
    expect(container.querySelector('.text-snap-guide.vertical')).not.toBeNull();
  });

  it('deletes on Delete (with confirm for long content) and deselects on Escape', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { props } = renderOverlay();
    const handle = screen.getByRole('button', { name: /Text layer/ });
    fireEvent.keyDown(handle, { key: 'Delete' });
    expect(confirmSpy).toHaveBeenCalled();
    expect(props.onDelete).toHaveBeenCalledWith('t-1');

    fireEvent.keyDown(handle, { key: 'Escape' });
    expect(props.onSelect).toHaveBeenCalledWith(null);
    confirmSpy.mockRestore();
  });

  it('nudges position with arrow keys', () => {
    const { props } = renderOverlay();
    const handle = screen.getByRole('button', { name: /Text layer/ });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ x: 0.51 }));
  });

  it('opens an inline editor on double-click', () => {
    renderOverlay();
    fireEvent.doubleClick(screen.getByRole('button', { name: /Text layer/ }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
