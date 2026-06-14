import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';

import ArtCollage from './ArtCollage';

/** A 1x1 transparent PNG so stories render artwork without bundling assets. */
const ART =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats to relax and study to',
    artist: 'Chillhop',
    album: 'Essentials',
    duration: 215,
    filePath: '/music/lofi.mp3',
    albumArt: ART,
    ...overrides,
  };
}

function makeLibrary(count: number): Track[] {
  return Array.from({ length: count }).map((_, i) => makeTrack({ id: `track-${i}` }));
}

const meta: Meta<typeof ArtCollage> = {
  title: 'mixes/ArtCollage',
  component: ArtCollage,
  decorators: [
    Story => (
      <div className="w-[32rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ArtCollage>;

export const Default: Story = {
  args: {
    library: makeLibrary(12),
  },
};

export const TooFew: Story = {
  args: {
    library: makeLibrary(2),
  },
};
