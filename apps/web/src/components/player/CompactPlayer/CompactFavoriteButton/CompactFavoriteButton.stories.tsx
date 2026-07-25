import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useTrackOverlayStore } from '@/stores/useTrackOverlayStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import CompactFavoriteButton from './CompactFavoriteButton';

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

/**
 * Seed the track the heart reflects. Overlays are cleared first so a toggle
 * driven by an earlier story never leaks into this one's initial state.
 */
function seedTrack(track: Track | null): void {
  useTrackOverlayStore.getState().clearAll();
  usePlaybackStore.setState({ currentTrack: track });
  useLibraryStore.setState({ library: track ? [track] : [] });
}

/**
 * player · CompactFavoriteButton. The heart in the compact window's title bar,
 * so the current track can be favorited without leaving the mini-player. It
 * reads `usePlaybackStore` for the track and merges the mutation overlay on top,
 * so it stays in sync with the main player bar. The icon-only button's
 * accessible name flips between "Add to favorites" and "Remove from favorites",
 * the heart fills when favorited, and a fresh favorite pops the heart and plays
 * an expanding burst ring. Radio streams (and an idle player) render nothing at
 * all. Stories seed the stores and drive the toggle in both directions.
 */
const meta: Meta<typeof CompactFavoriteButton> = {
  title: 'player/CompactFavoriteButton',
  component: CompactFavoriteButton,
  parameters: {
    layout: 'centered',
    // The control is icon-only but carries an aria-label, the burst ring is
    // aria-hidden, and the tooltip stays closed — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CompactFavoriteButton>;

/** Not favorited — the outline heart, offering to add. Clicking hearts it. */
export const NotFavorited: Story = {
  decorators: [
    Story => {
      seedTrack(makeTrack());
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Add to favorites' });

    await userEvent.click(button);

    // The optimistic overlay flips the state, so the same control now offers
    // the inverse action under its new accessible name.
    await expect(canvas.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Add to favorites' })
    ).not.toBeInTheDocument();
  },
};

/** Favorited — the filled heart, offering to remove. Clicking un-hearts it. */
export const Favorited: Story = {
  decorators: [
    Story => {
      seedTrack(makeTrack({ isFavorite: true }));
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Remove from favorites' });
    await expect(button.querySelector('svg')?.getAttribute('class')).toContain('fill-current');

    await userEvent.click(button);

    await expect(canvas.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  },
};

/** Radio stream — a live station has nothing to favorite, so nothing renders. */
export const RadioStream: Story = {
  decorators: [
    Story => {
      seedTrack(makeTrack({ filePath: 'shiranami-radio://lofi' }));
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};
