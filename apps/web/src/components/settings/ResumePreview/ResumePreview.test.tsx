import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ResumePreview from './ResumePreview';

/** The progress-bar fill is the only `bg-primary/55` block. */
const PROGRESS_FILL = '.bg-primary\\/55';

describe('ResumePreview', () => {
  it('renders the caption and the mock track title', () => {
    render(<ResumePreview enabled />);

    expect(screen.getByText('Position preview')).toBeInTheDocument();
    expect(screen.getByText('Midnight Rain')).toBeInTheDocument();
  });

  it('shows the saved position and a part-filled bar when resume is on', () => {
    const { container } = render(<ResumePreview enabled />);

    expect(screen.getByText('1:42')).toBeInTheDocument();
    expect(container.querySelector(PROGRESS_FILL)).toHaveStyle({ width: '44%' });
    expect(screen.getByText('Relaunch resumes from the saved moment.')).toBeInTheDocument();
  });

  it('shows a zeroed position and an empty bar when resume is off', () => {
    const { container } = render(<ResumePreview enabled={false} />);

    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(container.querySelector(PROGRESS_FILL)).toHaveStyle({ width: '0%' });
    expect(screen.getByText('Relaunch starts the track from the beginning.')).toBeInTheDocument();
  });

  it('swaps the explanatory caption with the toggle', () => {
    const { rerender } = render(<ResumePreview enabled />);
    expect(
      screen.queryByText('Relaunch starts the track from the beginning.')
    ).not.toBeInTheDocument();

    rerender(<ResumePreview enabled={false} />);
    expect(screen.queryByText('Relaunch resumes from the saved moment.')).not.toBeInTheDocument();
  });
});
