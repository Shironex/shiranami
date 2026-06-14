import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

import LyricsPanel from './LyricsPanel';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 198,
    filePath: '/music/midnight.mp3',
    isFavorite: false,
    ...overrides,
  };
}

/** Seed the playback store so the panel has a current track to render for. */
function seedTrack(track: Track | null): void {
  usePlaybackStore.setState({ currentTrack: track });
}

const meta: Meta<typeof LyricsPanel> = {
  title: 'lyrics/LyricsPanel',
  component: LyricsPanel,
  decorators: [
    Story => (
      <div className="flex h-[32rem] w-[22rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LyricsPanel>;

export const Default: Story = {
  decorators: [
    Story => {
      seedTrack(makeTrack());
      return <Story />;
    },
  ],
};

export const WithHeaderAction: Story = {
  args: {
    headerAction: (
      <button type="button" className="text-xs text-muted-foreground">
        Flip
      </button>
    ),
  },
  decorators: [
    Story => {
      seedTrack(makeTrack());
      return <Story />;
    },
  ],
};
