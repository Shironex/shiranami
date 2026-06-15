import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from 'storybook/test';
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

/**
 * player · PlayerControls. The transport cluster — shuffle, previous, play/pause,
 * next, repeat — backed by `usePlaybackStore`. Every glyph is icon-only, so each
 * control carries an aria-label from the `player` i18n namespace (Shuffle,
 * Previous, Play/Pause, Next, "Repeat: <mode>"). The play/pause button is
 * disabled with no current track and swaps its label between Play and Pause as
 * playback toggles. Stories seed the store, then click controls and assert the
 * store actions fire (clicking play/pause calls `togglePlay`, etc.).
 */
const meta: Meta<typeof PlayerControls> = {
  title: 'player/PlayerControls',
  component: PlayerControls,
  parameters: {
    layout: 'centered',
    // Every transport button is icon-only but labelled via aria-label; nothing
    // here trips axe, so the panel is held to the strict standard.
    a11y: { test: 'error' },
  },
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

/** Paused with a track — the primary control reads "Play" and clicking it toggles playback. */
export const Paused: Story = {
  decorators: [
    Story => {
      seedPlayback({ isPlaying: false });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const play = canvas.getByRole('button', { name: 'Play' });
    await expect(play).toBeEnabled();
    await expect(canvas.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument();

    await userEvent.click(play);
    // togglePlay flips isPlaying — the primary control relabels Play → Pause.
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  },
};

/** Playing with shuffle on and repeat-all — the control reads "Pause"; clicking next advances. */
export const Playing: Story = {
  decorators: [
    Story => {
      seedPlayback({ isPlaying: true, isShuffled: true, repeatMode: 'all' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    // Repeat label encodes the active mode for screen readers.
    await expect(canvas.getByRole('button', { name: 'Repeat: all' })).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Pause' }));
    await expect(canvas.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  },
};

/** Loading — while buffering (and not yet playing) the spinner replaces the glyph. */
export const Loading: Story = {
  decorators: [
    Story => {
      seedPlayback({ isLoading: true });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The label still resolves to Play (isPlaying is false) even though the
    // spinner glyph is shown — the accessible name tracks state, not the icon.
    await expect(canvas.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  },
};

/** Repeat-one — the repeat control announces its single-track mode. */
export const RepeatOne: Story = {
  decorators: [
    Story => {
      seedPlayback({ repeatMode: 'one' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Repeat: one' })).toBeInTheDocument();
  },
};

/** No track — the play/pause control is disabled until something is queued. */
export const Empty: Story = {
  decorators: [
    Story => {
      seedPlayback({ hasTrack: false });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Play' })).toBeDisabled();
  },
};
