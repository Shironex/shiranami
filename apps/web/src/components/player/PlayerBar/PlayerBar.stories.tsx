import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
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

/**
 * player · PlayerBar. The full bottom transport bar, assembled from the smaller
 * player parts: track info + favorite on the left, PlayerControls + seek row in
 * the center, and the volume + panel-toggle cluster (lyrics, queue, sleep timer,
 * EQ, compact, visualizer) on the right. It is gated on `usePlaybackStore`'s
 * current track (it renders nothing without one) and reads `useInterfaceStore`
 * for which elements to show. Radio streams swap the seek row for a "Live"
 * badge and hide the favorite control. Stories seed both stores and assert the
 * assembled chrome by role + name.
 */
const meta: Meta<typeof PlayerBar> = {
  title: 'player/PlayerBar',
  component: PlayerBar,
  parameters: {
    layout: 'fullscreen',
    // Transport + toggle buttons are all labelled, the seek + volume sliders
    // carry accessible names, and the EQ/sleep popovers stay closed — clean.
    a11y: { test: 'error' },
  },
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

/** Default — a local track with the full control cluster and the seek row. */
export const Default: Story = {
  decorators: [
    Story => {
      seedBar(makeTrack());
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Midnight Tapes')).toBeInTheDocument();
    // Transport + seek + volume are wired (playing → Pause).
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await expect(canvas.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
    await expect(canvas.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
    // Right-cluster toggles and the (closed) EQ popover trigger are present.
    await expect(canvas.getByRole('button', { name: 'Toggle lyrics' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Toggle queue' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Equalizer' })).toBeInTheDocument();
    // A local, non-radio track offers the add-to-favorites control.
    await expect(canvas.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  },
};

/** Radio — a live stream: the "Live" badge replaces the seek row and favorite. */
export const Radio: Story = {
  decorators: [
    Story => {
      seedBar(makeTrack({ title: 'Lofi Radio', filePath: 'shiranami-radio://lofi-girl' }));
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Lofi Radio')).toBeInTheDocument();
    // Live streams show the "Live" badge instead of a scrubber.
    await expect(canvas.getByText('Live')).toBeInTheDocument();
    await expect(canvas.queryByRole('slider', { name: 'Seek' })).not.toBeInTheDocument();
    // Favorite is suppressed for radio.
    await expect(
      canvas.queryByRole('button', { name: 'Add to favorites' })
    ).not.toBeInTheDocument();
  },
};

/** Favorited — a hearted track: the favorite control offers to remove it. */
export const Favorited: Story = {
  decorators: [
    Story => {
      seedBar(makeTrack({ isFavorite: true }));
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A favorited track flips the control to "Remove from favorites".
    await expect(canvas.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  },
};
