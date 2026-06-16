import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AlbumSortControl from './AlbumSortControl';
import type { IAlbumSortControlLabels } from './AlbumSortControl.types';

const labels: IAlbumSortControlLabels = {
  button: 'Sort albums',
  modeName: 'Name',
  modeArtist: 'Artist',
  modeYear: 'Year',
  modeRecentlyAdded: 'Recently added',
  orderAsc: 'Ascending',
  orderDesc: 'Descending',
};

describe('AlbumSortControl', () => {
  it('renders the trigger summarizing the active sort mode', () => {
    render(
      <AlbumSortControl
        mode="artist"
        order="asc"
        onModeChange={vi.fn()}
        onOrderChange={vi.fn()}
        labels={labels}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Sort albums' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Artist');
  });
});
