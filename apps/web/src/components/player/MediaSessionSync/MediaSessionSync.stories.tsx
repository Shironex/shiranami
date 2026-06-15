import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

import MediaSessionSync from './MediaSessionSync';

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

/** Seed the playback store the leaf reads so its effects run against real data. */
function seedPlayback(): void {
  usePlaybackStore.setState({
    currentTrack: makeTrack(),
    isPlaying: true,
    currentTime: 42,
    duration: 215,
  });
}

const meta: Meta<typeof MediaSessionSync> = {
  title: 'player/MediaSessionSync',
  component: MediaSessionSync,
  parameters: { layout: 'centered' },
};

export default meta;

type Story = StoryObj<typeof MediaSessionSync>;

/**
 * The component renders nothing — this story exists to exercise its media-session
 * side-effects in isolation. The surface is intentionally blank.
 */
export const Default: Story = {
  decorators: [
    Story => {
      seedPlayback();
      return <Story />;
    },
  ],
};
