import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PlaylistsViewSkeleton from './PlaylistsViewSkeleton';

describe('PlaylistsViewSkeleton', () => {
  it('marks the whole frame busy while the playlists load', () => {
    const { container } = render(<PlaylistsViewSkeleton />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('reserves the header row so the toolbar does not shift in', () => {
    const { container } = render(<PlaylistsViewSkeleton />);

    const frame = container.querySelector('[aria-busy="true"]');
    // Header row + scrollable grid body.
    expect(frame?.children).toHaveLength(2);
    // Title chip, flexible spacer, grid-size toggle chip.
    expect(frame?.children[0].children).toHaveLength(3);
  });

  it('fills the grid with ten placeholder cards', () => {
    const { container } = render(<PlaylistsViewSkeleton />);

    const grid = container.querySelector('.grid');
    expect(grid).not.toBeNull();
    expect(grid?.children).toHaveLength(10);
  });

  it('shapes each card as a square cover above two text lines', () => {
    const { container } = render(<PlaylistsViewSkeleton />);

    const card = container.querySelector('.grid')?.children[0];
    expect(card?.children).toHaveLength(3);
    expect(card?.children[0]).toHaveClass('aspect-square');
  });

  it('builds every placeholder from the shared skeleton primitive', () => {
    const { container } = render(<PlaylistsViewSkeleton />);

    // 2 header chips + 3 per card × 10 cards.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(32);
  });

  it('renders no readable copy or interactive controls while loading', () => {
    const { container } = render(<PlaylistsViewSkeleton />);

    expect(container.textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
