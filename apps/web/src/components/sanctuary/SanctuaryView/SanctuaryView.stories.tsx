import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSanctuaryStore } from '@/stores/useSanctuaryStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import SanctuaryView from './SanctuaryView';

const STORY_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
      `<rect width="240" height="240" fill="%23342a56"/>` +
      `<circle cx="70" cy="80" r="60" fill="%239b7deb"/>` +
      `<circle cx="180" cy="170" r="80" fill="%23f09e60"/>` +
      `</svg>`
  );

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    albumArt: STORY_COVER,
    ...overrides,
  };
}

/**
 * sanctuary · SanctuaryView. The fullscreen immersive player: the cover (or a
 * large clock) center-stage, the active lyric line in the display serif, swim-
 * away chrome, and the hairline waveform at the bottom edge. Reads
 * `usePlaybackStore` and `useSanctuaryStore`; renders nothing without a track.
 * Stories seed a playing track and an active sanctuary.
 */
const meta: Meta<typeof SanctuaryView> = {
  title: 'sanctuary/SanctuaryView',
  component: SanctuaryView,
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TooltipProvider>
          <div className="flex h-[44rem] flex-col bg-background">
            <Story />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SanctuaryView>;

/** Cover center-stage: art, title in the serif italic, transport below. */
export const Cover: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215, isPlaying: true });
    useSanctuaryStore.setState({ sanctuaryActive: true, sanctuaryVariant: 'cover' });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Midnight Tapes' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Leave Sanctuary' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Show the clock' })).toBeInTheDocument();
  },
};

/** Clock center-stage: the desk-display variant with the track underneath. */
export const Clock: Story = {
  beforeEach: () => {
    usePlaybackStore.setState({ currentTrack: makeTrack(), duration: 215, isPlaying: true });
    useSanctuaryStore.setState({ sanctuaryActive: true, sanctuaryVariant: 'clock' });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Show the record' })).toBeInTheDocument();
    await expect(canvas.getByText(/Midnight Tapes/)).toBeInTheDocument();
  },
};
