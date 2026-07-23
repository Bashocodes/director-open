import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DirectorLibrary } from './DirectorLibrary';

describe('DirectorLibrary', () => {
  it('offers a neutral local upload state and forwards selected images', () => {
    const onUpload = vi.fn();
    render(<DirectorLibrary onUpload={onUpload} />);
    const file = new File(['image'], 'reference.png', { type: 'image/png' });

    expect(screen.getByText(/library starts empty/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Upload local images'), {
      target: { files: [file] },
    });

    expect(onUpload).toHaveBeenCalledWith([file]);
  });
});
