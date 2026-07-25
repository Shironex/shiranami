import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SearchStateCard from './SearchStateCard';

describe('SearchStateCard', () => {
  it('renders the title and description through the shared status card', () => {
    render(<SearchStateCard title="Preparing search" description="Checking yt-dlp and ffmpeg." />);

    expect(screen.getByText('Preparing search')).toBeInTheDocument();
    expect(screen.getByText('Checking yt-dlp and ffmpeg.')).toBeInTheDocument();
  });

  it('renders children beneath the description', () => {
    render(
      <SearchStateCard title="Search tools missing" description="Install them to continue.">
        <button type="button">Install Missing Tools</button>
      </SearchStateCard>
    );

    expect(screen.getByRole('button', { name: 'Install Missing Tools' })).toBeInTheDocument();
  });

  it('shows a spinner badge while loading', () => {
    const { container } = render(
      <SearchStateCard title="Preparing search" description="Checking yt-dlp and ffmpeg." loading />
    );

    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('shows no badge when it is neither loading nor given one', () => {
    const { container } = render(
      <SearchStateCard title="Preparing search" description="Checking yt-dlp and ffmpeg." />
    );

    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('keeps the mascot decorative so the card exposes no image to assistive tech', () => {
    const { container } = render(<SearchStateCard title="Preparing search" description="Soon." />);

    const mascot = container.querySelector('img');
    expect(mascot).toHaveAttribute('alt', '');
    expect(mascot).toHaveAttribute('aria-hidden', 'true');
  });
});
