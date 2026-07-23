import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopNav } from './TopNav';

describe('TopNav standalone identity', () => {
  it('presents the neutral open-source identity without external product links', () => {
    render(<TopNav />);

    expect(screen.getByLabelText('Director Open')).toBeInTheDocument();
    expect(screen.getByText('Director Open')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('LOCAL-FIRST CREATIVE STUDIO')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
