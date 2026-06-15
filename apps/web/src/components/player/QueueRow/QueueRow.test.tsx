import type { MouseEvent } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Track } from '@/stores/types';

import SortableQueueRow, { QueueItem, DragOverlayContent } from './QueueRow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function renderSortable(overrides: Partial<Parameters<typeof SortableQueueRow>[0]> = {}) {
  const props = {
    track: makeTrack(),
    sortableId: 'queue-1',
    queueIndex: 1,
    onPlay: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <DndContext>
      <SortableContext items={['queue-1']} strategy={verticalListSortingStrategy}>
        <SortableQueueRow {...props} />
      </SortableContext>
    </DndContext>
  );
  return { ...utils, props };
}

describe('SortableQueueRow', () => {
  it('renders the track title, artist, and a drag handle', () => {
    renderSortable({ track: makeTrack({ title: 'Drift', artist: 'Tide' }) });

    expect(screen.getByText('Drift')).toBeInTheDocument();
    expect(screen.getByText('Tide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dragToReorder' })).toBeInTheDocument();
  });

  it('plays the row with its queue index on click', async () => {
    const onPlay = vi.fn();
    renderSortable({ queueIndex: 4, onPlay, track: makeTrack({ title: 'Click me' }) });

    await userEvent.click(screen.getByText('Click me'));
    expect(onPlay).toHaveBeenCalledWith(4);
  });

  it('removes the row with its queue index; the consumer stops propagation', async () => {
    const onPlay = vi.fn();
    // The real consumer (QueuePanel) calls e.stopPropagation() inside onRemove
    // so the row's onClick (play) does not also fire — model that here.
    const onRemove = vi.fn((e: MouseEvent) => e.stopPropagation());
    renderSortable({ queueIndex: 2, onPlay, onRemove });

    await userEvent.click(screen.getByRole('button', { name: 'remove' }));
    expect(onRemove).toHaveBeenCalledWith(expect.anything(), 2);
    expect(onPlay).not.toHaveBeenCalled();
  });
});

describe('QueueItem', () => {
  it('plays at the given index when clicked', async () => {
    const onPlay = vi.fn();
    render(
      <QueueItem
        track={makeTrack({ title: 'Now this', id: 'np' })}
        index={0}
        isActive
        isPlaying
        onPlay={onPlay}
        onRemove={vi.fn()}
      />
    );

    await userEvent.click(screen.getByText('Now this'));
    expect(onPlay).toHaveBeenCalledWith(0);
  });

  it('announces the active playing row for screen readers', () => {
    render(
      <QueueItem
        track={makeTrack({ id: 'np' })}
        index={0}
        isActive
        isPlaying
        onPlay={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText('nowPlaying')).toBeInTheDocument();
  });
});

describe('DragOverlayContent', () => {
  it('renders the dragged track title', () => {
    render(<DragOverlayContent track={makeTrack({ title: 'Floating' })} />);

    expect(screen.getByText('Floating')).toBeInTheDocument();
  });
});
