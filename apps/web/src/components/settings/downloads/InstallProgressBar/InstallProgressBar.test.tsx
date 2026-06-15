import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InstallProgressBar from './InstallProgressBar';

describe('InstallProgressBar', () => {
  it('renders the caption inside a polite live region', () => {
    render(<InstallProgressBar percent={42} caption="Downloading yt-dlp... 42%" />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Downloading yt-dlp... 42%')).toBeInTheDocument();
  });
});
