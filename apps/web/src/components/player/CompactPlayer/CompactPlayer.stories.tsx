import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useCompactStore } from '@/stores/useCompactStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import CompactPlayer from './CompactPlayer';

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

/** Seed the playback + compact stores so the mini-player renders with real data. */
function seedCompact(track: Track | null): void {
  usePlaybackStore.setState({ currentTrack: track, duration: 215, isPlaying: true });
  useCompactStore.setState({
    compactShowAlbumArt: true,
    compactShowAlbum: true,
    compactShowSeek: true,
    compactShowVolume: true,
    compactShowFavorite: true,
    compactShowLyrics: true,
    compactLyricsExpanded: false,
  });
}

const meta: Meta<typeof CompactPlayer> = {
  title: 'player/CompactPlayer',
  component: CompactPlayer,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="h-[180px] w-[360px] overflow-hidden rounded-xl border border-border/30">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CompactPlayer>;

export const Playing: Story = {
  decorators: [
    Story => {
      seedCompact(makeTrack());
      return <Story />;
    },
  ],
};

export const Idle: Story = {
  decorators: [
    Story => {
      seedCompact(null);
      return <Story />;
    },
  ],
};
