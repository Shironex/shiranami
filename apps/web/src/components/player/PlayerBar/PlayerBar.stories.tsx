import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import PlayerBar from './PlayerBar';

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

/** Seed the playback + interface stores the bar reads so it renders with chrome. */
function seedBar(track: Track | null): void {
  usePlaybackStore.setState({ currentTrack: track, duration: 215, isPlaying: true });
  useInterfaceStore.setState({
    playerAlbumArt: true,
    playerFavorite: true,
    playerTimeLabels: true,
    playerVolume: true,
    playerLyricsButton: true,
    playerQueueButton: true,
    playerSleepTimer: true,
    playerEqualizer: true,
    playerCompactButton: true,
    playerVisualizerButton: true,
    playerWaveformSeekbar: false,
  });
}

const meta: Meta<typeof PlayerBar> = {
  title: 'player/PlayerBar',
  component: PlayerBar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="relative h-[28rem] w-full">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlayerBar>;

export const Default: Story = {
  decorators: [
    Story => {
      seedBar(makeTrack());
      return <Story />;
    },
  ],
};

export const Radio: Story = {
  decorators: [
    Story => {
      seedBar(makeTrack({ title: 'Lofi Radio', filePath: 'https://stream.example.com/lofi' }));
      return <Story />;
    },
  ],
};

export const Favorited: Story = {
  decorators: [
    Story => {
      seedBar(makeTrack({ isFavorite: true }));
      return <Story />;
    },
  ],
};
