import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DirectorMediaDrawer } from './DirectorMediaDrawer';
import type { LibraryItem, LibrarySource } from '../librarySource';

function makeSource(items: LibraryItem[], overrides: Partial<LibrarySource> = {}): LibrarySource {
  return {
    id: 'local',
    label: 'Local media',
    localOnly: true,
    list: () => items,
    add: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

const imageItem: LibraryItem = {
  id: 'upload-1', kind: 'image', title: 'Quiet Warrior', url: 'blob:warrior', sizeLabel: '820 KB', origin: 'canvas',
};
const audioItem: LibraryItem = {
  id: 'reel-audio', kind: 'audio', title: 'score.wav', sizeLabel: '1.2 MB', origin: 'reel-audio',
};

describe('DirectorMediaDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <DirectorMediaDrawer open={false} source={makeSource([])} persistenceStatus="saved" onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('lists local images and audio with per-item remove', () => {
    const remove = vi.fn();
    render(
      <DirectorMediaDrawer open source={makeSource([imageItem, audioItem], { remove })} persistenceStatus="saved" onClose={vi.fn()} />,
    );
    expect(screen.getByRole('img', { name: 'Quiet Warrior' })).toBeInTheDocument();
    expect(screen.getByText('score.wav')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Quiet Warrior' }));
    expect(remove).toHaveBeenCalledWith(imageItem);
  });

  it('shows an honest persistence note that media survives refresh', () => {
    render(
      <DirectorMediaDrawer open source={makeSource([imageItem])} persistenceStatus="saved" onClose={vi.fn()} />,
    );
    expect(screen.getByText(/restored after a page refresh/i)).toBeInTheDocument();
  });

  it('warns honestly when storage is unavailable', () => {
    render(
      <DirectorMediaDrawer open source={makeSource([imageItem])} persistenceStatus="unavailable" onClose={vi.fn()} />,
    );
    expect(screen.getByText(/lost on refresh/i)).toBeInTheDocument();
  });

  it('renders a calm empty state with a single action', () => {
    render(
      <DirectorMediaDrawer open source={makeSource([])} persistenceStatus="saved" onClose={vi.fn()} />,
    );
    expect(screen.getByText(/No local media yet/i)).toBeInTheDocument();
  });

  it('forwards uploads to the source', () => {
    const add = vi.fn();
    const { container } = render(
      <DirectorMediaDrawer open source={makeSource([], { add })} persistenceStatus="saved" onClose={vi.fn()} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'new.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(add).toHaveBeenCalledWith([file]);
  });

  it('closes on X, backdrop click, and Escape', () => {
    const onClose = vi.fn();
    render(
      <DirectorMediaDrawer open source={makeSource([imageItem])} persistenceStatus="saved" onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close media drawer' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss media drawer' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
