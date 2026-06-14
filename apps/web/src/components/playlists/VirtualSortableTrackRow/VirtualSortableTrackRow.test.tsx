import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { RowComponentProps } from 'react-window';
import type { Track } from '@/stores/types';

import VirtualSortableTrackRow from './VirtualSortableTrackRow';
import type { IVirtualSortableTrackRowProps } from './VirtualSortableTrackRow.types';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Test Artist',
    album: 'Test Album',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function renderRow(
  tracks: Track[],
  overrides: Partial<IVirtualSortableTrackRowProps> = {},
  index = 0
) {
  const props = {
    index,
    style: undefined,
    tracks,
    currentTrack: null,
    isPlaying: false,
    onPlayTrack: () => {},
    onToggleFavorite: () => {},
    onRemoveTrack: () => {},
    ...overrides,
  } as unknown as RowComponentProps<IVirtualSortableTrackRowProps>;

  return render(
    <DndContext>
      <SortableContext items={tracks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <VirtualSortableTrackRow {...props} />
      </SortableContext>
    </DndContext>
  );
}

describe('VirtualSortableTrackRow', () => {
  it('renders the track resolved from its index', () => {
    renderRow(
      [makeTrack({ id: 'a', title: 'First' }), makeTrack({ id: 'b', title: 'Second' })],
      {},
      1
    );

    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('exposes a drag handle for reordering', () => {
    renderRow([makeTrack()]);

    expect(screen.getByRole('button', { name: 'Drag to reorder' })).toBeInTheDocument();
  });
});
