import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
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

/**
 * player · CompactPlayer. The mini "Compact Mode" window — a title bar with
 * favorite, lyrics (a pressed toggle), pin, expand, and minimize buttons, over a
 * card holding the album art, track text, transport (PlayerControls), volume, and
 * a seek row (SeekBar + TimeDisplay). It reads `usePlaybackStore` for the track
 * and `useCompactStore` for which chrome to show. With no track it shows the
 * "Nothing playing" idle state and the transport play button is disabled. Stories
 * seed both stores and assert the chrome by role + name.
 */
const meta: Meta<typeof CompactPlayer> = {
  title: 'player/CompactPlayer',
  component: CompactPlayer,
  parameters: {
    layout: 'centered',
    // Every chrome button is icon-only but labelled, the favorite/lyrics toggles
    // expose state, and the seek + volume sliders carry accessible names — clean.
    a11y: { test: 'error' },
  },
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

/** Playing — the mini-player with its full chrome and an active lyrics toggle. */
export const Playing: Story = {
  decorators: [
    Story => {
      seedCompact(makeTrack());
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Midnight Tapes')).toBeInTheDocument();
    // Transport is wired (playing → Pause); the seek + volume sliders are named.
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await expect(canvas.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
    await expect(canvas.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();

    // The lyrics control is a toggle button reporting its (closed) pressed state.
    const lyrics = canvas.getByRole('button', { name: 'Show lyrics' });
    await expect(lyrics).toHaveAttribute('aria-pressed', 'false');
    // The album art doubles as the expand-to-full-player control.
    await expect(canvas.getByRole('button', { name: 'Expand to full player' })).toBeInTheDocument();
  },
};

/** Idle — no track: the placeholder copy shows and transport is disabled. */
export const Idle: Story = {
  decorators: [
    Story => {
      seedCompact(null);
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Nothing playing')).toBeInTheDocument();
    // No track to control, so the transport play/pause button is disabled. Its
    // label tracks the seeded `isPlaying` flag (here "Pause"), not the absence of
    // a track — assert the disabled transport control rather than a "Play" label
    // that this idle seed never renders.
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeDisabled();
  },
};
