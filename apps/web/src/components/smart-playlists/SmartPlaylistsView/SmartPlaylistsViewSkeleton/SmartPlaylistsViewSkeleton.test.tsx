import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SmartPlaylistsViewSkeleton from './SmartPlaylistsViewSkeleton';

describe('SmartPlaylistsViewSkeleton', () => {
  it('marks the whole frame busy while the list loads', () => {
    const { container } = render(<SmartPlaylistsViewSkeleton />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('announces the page title through a screen-reader status line', () => {
    render(<SmartPlaylistsViewSkeleton />);

    expect(screen.getByRole('status')).toHaveTextContent('Smart Playlists');
  });

  it('renders the section header so the frame matches the loaded view', () => {
    render(<SmartPlaylistsViewSkeleton />);

    expect(screen.getByRole('heading', { name: 'Smart Playlists' })).toBeInTheDocument();
  });

  it('fills the grid with six placeholder cards', () => {
    const { container } = render(<SmartPlaylistsViewSkeleton />);

    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();
    expect(grid?.children).toHaveLength(6);
  });

  it('renders no interactive controls — the create button is a placeholder too', () => {
    render(<SmartPlaylistsViewSkeleton />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
