import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';

import LibraryView from './LibraryView';

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

const library: Track[] = [
  makeTrack({ id: 'a1', title: 'Intro', album: 'Midnight Tapes', artist: 'Idealism' }),
  makeTrack({ id: 'a2', title: 'Drift', album: 'Midnight Tapes', artist: 'Idealism' }),
  makeTrack({ id: 'b1', title: 'Cafe', album: 'Rainy Day', artist: 'Aso' }),
];

function seed(tracks: Track[], mode: 'tracks' | 'albums' = 'tracks'): void {
  useLibraryStore.setState({ library: tracks, libraryLoaded: true });
  useUIStore.setState({ libraryViewMode: mode, libraryHeroCardEnabled: false });
  useViewStore.setState({ selectedAlbumKey: null });
}

const meta: Meta<typeof LibraryView> = {
  title: 'library/LibraryView',
  component: LibraryView,
  decorators: [
    Story => (
      <div className="flex h-[40rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LibraryView>;

export const Default: Story = {
  decorators: [
    Story => {
      seed(library, 'tracks');
      return <Story />;
    },
  ],
};

export const Albums: Story = {
  decorators: [
    Story => {
      seed(library, 'albums');
      return <Story />;
    },
  ],
};

export const Empty: Story = {
  decorators: [
    Story => {
      seed([], 'tracks');
      return <Story />;
    },
  ],
};
