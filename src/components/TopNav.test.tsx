import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopNav } from './TopNav';

describe('TopNav standalone identity', () => {
  it('presents the neutral open-source identity without external product links', () => {
    render(<TopNav />);

    expect(screen.getByLabelText('Director Open')).toBeInTheDocument();
    expect(screen.getByText('Director Open')).toHaveAttribute('aria-current', 'page');
    const privacy = screen.getByRole('button', { name: /100% local — your media never leaves this browser/i });
    expect(privacy).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(privacy);
    expect(privacy).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Local media privacy')).toHaveTextContent('stored in IndexedDB');
    expect(screen.getByLabelText('Local media privacy')).toHaveTextContent('static app files only');
    expect(screen.getByLabelText('Local media privacy')).toHaveTextContent('no media upload, storage, proxy, analytics, or telemetry endpoint');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
