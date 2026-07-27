import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopNav } from './TopNav';

describe('TopNav workspace shell', () => {
  it('contains exactly the Director and Conductor tabs', () => {
    render(<TopNav />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('Director');
    expect(links[0]).toHaveAttribute('href', '/director/');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links[1]).toHaveTextContent('Conductor');
    expect(links[1]).toHaveAttribute('href', '/conductor/');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
