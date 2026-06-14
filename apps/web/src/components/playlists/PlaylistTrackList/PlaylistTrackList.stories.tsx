import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';

import PlaylistTrackList from './PlaylistTrackList';

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

const tracks = [
  makeTrack({ id: 'a', title: 'Midnight study session' }),
  makeTrack({ id: 'b', title: 'Rainy day cafe' }),
  makeTrack({ id: 'c', title: 'Slow morning coffee' }),
];

const meta: Meta<typeof PlaylistTrackList> = {
  title: 'playlists/PlaylistTrackList',
  component: PlaylistTrackList,
  args: {
    displayTracks: tracks,
    sortableIds: tracks.map(t => t.id),
    activeTrack: null,
    currentTrack: null,
    isPlaying: false,
    sensors: [],
    onDragStart: () => {},
    onDragEnd: () => {},
    onDragCancel: () => {},
    onPlayTrack: () => {},
    onToggleFavorite: () => {},
    onRemoveTrack: () => {},
  },
  decorators: [
    Story => (
      <div className="flex h-[36rem] w-[40rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlaylistTrackList>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    displayTracks: [],
    sortableIds: [],
  },
};
