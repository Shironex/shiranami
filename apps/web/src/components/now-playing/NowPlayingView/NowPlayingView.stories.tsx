import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Track } from '@/stores/types';
import type { NowPlayingPanel } from '@/stores/useUIStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import NowPlayingView from './NowPlayingView';

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

/** Seed the stores the view reads so it renders without IPC or live playback. */
function seedNowPlaying(panel: NowPlayingPanel): void {
  usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215, isPlaying: true });
  useUIStore.setState({ nowPlayingPanel: panel });
  // Land the view on now-playing so `exitNowPlaying` is a no-op during the story.
  useViewStore.setState({ activeView: 'now-playing', previousView: 'library' });
}

const meta: Meta<typeof NowPlayingView> = {
  title: 'now-playing/NowPlayingView',
  component: NowPlayingView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TooltipProvider>
          <div className="flex h-[44rem] flex-col">
            <Story />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof NowPlayingView>;

export const Lyrics: Story = {
  decorators: [
    Story => {
      seedNowPlaying('lyrics');
      return <Story />;
    },
  ],
};

export const Queue: Story = {
  decorators: [
    Story => {
      seedNowPlaying('queue');
      return <Story />;
    },
  ],
};

export const NoPanel: Story = {
  decorators: [
    Story => {
      seedNowPlaying(null);
      return <Story />;
    },
  ],
};
