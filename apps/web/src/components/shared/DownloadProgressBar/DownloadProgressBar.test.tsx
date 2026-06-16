import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DownloadProgressBar from './DownloadProgressBar';

describe('DownloadProgressBar', () => {
  it('renders a named, clamped determinate progressbar when given a percentage', () => {
    render(<DownloadProgressBar progress={150} ariaLabel="Download progress" />);

    const bar = screen.getByRole('progressbar', { name: 'Download progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders a decorative indeterminate sweep when no percentage is known', () => {
    const { container } = render(<DownloadProgressBar />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"] .progress-sweep')).toBeInTheDocument();
  });

  it('merges a custom className onto the root', () => {
    render(
      <DownloadProgressBar progress={50} ariaLabel="Download progress" className="rounded-b-2xl" />
    );

    expect(screen.getByRole('progressbar').className).toContain('rounded-b-2xl');
  });
});
