import type { Meta, StoryObj } from '@storybook/react-vite';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Track } from '@/stores/types';

import SortableQueueRow, { QueueItem, DragOverlayContent } from './QueueRow';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Girl',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

const track = makeTrack();

const meta: Meta<typeof SortableQueueRow> = {
  title: 'player/QueueRow',
  component: SortableQueueRow,
  args: {
    track,
    sortableId: 'queue-1',
    queueIndex: 1,
    onPlay: () => {},
    onRemove: () => {},
  },
  decorators: [
    Story => (
      <div className="w-80 p-4">
        <DndContext>
          <SortableContext items={['queue-1']} strategy={verticalListSortingStrategy}>
            <Story />
          </SortableContext>
        </DndContext>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SortableQueueRow>;

export const Sortable: Story = {};

export const NowPlaying: StoryObj<typeof QueueItem> = {
  render: () => (
    <div className="w-80 p-4">
      <QueueItem track={track} index={0} isActive isPlaying onPlay={() => {}} onRemove={() => {}} />
    </div>
  ),
};

export const Overlay: StoryObj<typeof DragOverlayContent> = {
  render: () => (
    <div className="w-80 p-4">
      <DragOverlayContent track={track} />
    </div>
  ),
};
