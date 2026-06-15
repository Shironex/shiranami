import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import type { RepeatMode } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import PlayerControls from './PlayerControls';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

interface SeedOptions {
  isPlaying?: boolean;
  isLoading?: boolean;
  isShuffled?: boolean;
  repeatMode?: RepeatMode;
  hasTrack?: boolean;
}

/** Seed the playback store the controls read so they render without engine wiring. */
function seedPlayback(opts: SeedOptions = {}): void {
  usePlaybackStore.setState({
    currentTrack: opts.hasTrack === false ? null : makeTrack(),
    isPlaying: opts.isPlaying ?? false,
    isLoading: opts.isLoading ?? false,
    isShuffled: opts.isShuffled ?? false,
    repeatMode: opts.repeatMode ?? 'off',
  });
}

const meta: Meta<typeof PlayerControls> = {
  title: 'player/PlayerControls',
  component: PlayerControls,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlayerControls>;

export const Paused: Story = {
  decorators: [
    Story => {
      seedPlayback({ isPlaying: false });
      return <Story />;
    },
  ],
};

export const Playing: Story = {
  decorators: [
    Story => {
      seedPlayback({ isPlaying: true, isShuffled: true, repeatMode: 'all' });
      return <Story />;
    },
  ],
};

export const Loading: Story = {
  decorators: [
    Story => {
      seedPlayback({ isLoading: true });
      return <Story />;
    },
  ],
};

export const RepeatOne: Story = {
  decorators: [
    Story => {
      seedPlayback({ repeatMode: 'one' });
      return <Story />;
    },
  ],
};
