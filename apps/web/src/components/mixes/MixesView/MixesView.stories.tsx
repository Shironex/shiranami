import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';

import MixesView from './MixesView';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats to relax and study to',
    artist: 'Chillhop',
    album: 'Essentials',
    duration: 215,
    filePath: '/music/lofi.mp3',
    albumArt: undefined,
    playCount: 3,
    ...overrides,
  };
}

/** Seed the library the mixes view reads from. */
function seedLibrary(tracks: Track[], libraryLoaded = true): void {
  useLibraryStore.setState({ library: tracks, libraryLoaded });
}

const meta: Meta<typeof MixesView> = {
  title: 'mixes/MixesView',
  component: MixesView,
  decorators: [
    Story => (
      <div className="flex h-[36rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MixesView>;

export const Default: Story = {
  decorators: [
    Story => {
      seedLibrary([
        makeTrack({ id: 'a', title: 'Midnight study session', artist: 'Idealism', playCount: 12 }),
        makeTrack({ id: 'b', title: 'Rainy day cafe', artist: 'Aso', playCount: 5 }),
        makeTrack({ id: 'c', title: 'Slow morning coffee', artist: 'Kupla', playCount: 0 }),
      ]);
      return <Story />;
    },
  ],
};

export const Empty: Story = {
  decorators: [
    Story => {
      seedLibrary([]);
      return <Story />;
    },
  ],
};

export const Loading: Story = {
  decorators: [
    Story => {
      seedLibrary([], false);
      return <Story />;
    },
  ],
};
