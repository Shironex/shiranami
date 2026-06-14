import type { Meta, StoryObj } from '@storybook/react-vite';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Track } from '@/stores/types';

import VirtualSortableTrackRow from './VirtualSortableTrackRow';

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

const meta: Meta<typeof VirtualSortableTrackRow> = {
  title: 'playlists/VirtualSortableTrackRow',
  component: VirtualSortableTrackRow,
  args: {
    index: 0,
    style: { position: 'relative', height: 48 },
    tracks: [track],
    currentTrack: null,
    isPlaying: false,
    onPlayTrack: () => {},
    onToggleFavorite: () => {},
    onRemoveTrack: () => {},
  },
  decorators: [
    Story => (
      <div className="w-[32rem] p-4">
        <DndContext>
          <SortableContext items={[track.id]} strategy={verticalListSortingStrategy}>
            <Story />
          </SortableContext>
        </DndContext>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VirtualSortableTrackRow>;

export const Default: Story = {};

export const Playing: Story = {
  args: {
    currentTrack: track,
    isPlaying: true,
  },
};
