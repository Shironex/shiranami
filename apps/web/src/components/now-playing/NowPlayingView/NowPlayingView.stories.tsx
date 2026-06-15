import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect, waitFor } from 'storybook/test';
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

/**
 * now-playing · NowPlayingView. The full-screen player: a back button, a
 * lyrics / queue / equalizer panel-toggle group, large album art with track
 * info, the seek bar + time, transport controls + volume, and the active
 * right-column panel. Reads `usePlaybackStore` (the track), `useUIStore` (the
 * active panel), and `useViewStore`; renders nothing when no track is playing.
 * Stories seed a playing track and a chosen panel so the view is deterministic.
 */
const meta: Meta<typeof NowPlayingView> = {
  title: 'now-playing/NowPlayingView',
  component: NowPlayingView,
  parameters: {
    layout: 'fullscreen',
    // Track title is a real <h1>, the toggle group + its buttons are labelled
    // and aria-pressed, the back button is labelled, and the player children
    // forward their accessible names to the slider thumbs — axe passes clean.
    a11y: { test: 'error' },
  },
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

/** Lyrics panel active — track info, transport, and the lyrics column. */
export const Lyrics: Story = {
  beforeEach: () => {
    seedNowPlaying('lyrics');
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Midnight Tapes' })).toBeInTheDocument();
    await expect(canvas.getByRole('group', { name: 'Now playing panels' })).toBeInTheDocument();
    // The lyrics panel is active, so its toggle reads as the "hide" action.
    await expect(canvas.getByRole('button', { name: 'Hide lyrics' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Show queue' })).toBeInTheDocument();
  },
};

/** Queue panel active — pressing a different toggle swaps the active panel. */
export const Queue: Story = {
  beforeEach: () => {
    seedNowPlaying('queue');
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The queue toggle is the active (pressed) one here.
    const queueToggle = canvas.getByRole('button', { name: 'Hide queue' });
    await expect(queueToggle).toHaveAttribute('aria-pressed', 'true');

    // Switching to lyrics drives the shared UI store and re-labels the toggles.
    await userEvent.click(canvas.getByRole('button', { name: 'Show lyrics' }));
    await waitFor(() => expect(useUIStore.getState().nowPlayingPanel).toBe('lyrics'));
    await expect(canvas.getByRole('button', { name: 'Hide lyrics' })).toBeInTheDocument();
  },
};

/** No panel — the centered layout with art + transport and all toggles inactive. */
export const NoPanel: Story = {
  beforeEach: () => {
    seedNowPlaying(null);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Midnight Tapes' })).toBeInTheDocument();
    // With no active panel every toggle reads as a "show" action.
    await expect(canvas.getByRole('button', { name: 'Show lyrics' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Show queue' })).toBeInTheDocument();
  },
};
