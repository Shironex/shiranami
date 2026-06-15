import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

import FavoritesView from './FavoritesView';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats to relax and study to',
    artist: 'Chillhop',
    album: 'Essentials',
    duration: 215,
    filePath: '/music/lofi.mp3',
    albumArt: undefined,
    isFavorite: true,
    ...overrides,
  };
}

/** Seed the library the favorites view reads from. */
function seedLibrary(tracks: Track[], libraryLoaded = true): void {
  useLibraryStore.setState({ library: tracks, libraryLoaded });
}

/**
 * favorites · FavoritesView. The page shell for liked tracks: a page header, an
 * optional now-playing hero, and a virtualized `TrackRow` list filtered to
 * favorited tracks. Reads `useLibraryStore` (the tracks) and `useUIStore` (the
 * hero toggle); shows a skeleton until the library loads and an empty state
 * once loaded with no favorites. Stories seed the stores so the list is
 * deterministic, and keep the hero card off to stay focused on the list.
 */
const meta: Meta<typeof FavoritesView> = {
  title: 'favorites/FavoritesView',
  component: FavoritesView,
  parameters: {
    // Header is a real <h1>, the empty state's mascot art is aria-hidden, and
    // the skeleton marks itself aria-busy — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[36rem] flex-col">
        <Story />
      </div>
    ),
  ],
  beforeEach: () => {
    // Keep the hero card off so the view stays focused on the list (and needs no
    // playback seed); selection cleared so the bulk action bar stays hidden.
    useUIStore.setState({ libraryHeroCardEnabled: false });
    useSelectionStore.setState({ selectedTrackIds: new Set() });
  },
};

export default meta;

type Story = StoryObj<typeof FavoritesView>;

/** Loaded library with three favorited tracks — header + virtualized list. */
export const Default: Story = {
  beforeEach: () => {
    seedLibrary([
      makeTrack({ id: 'a', title: 'Midnight study session', artist: 'Idealism' }),
      makeTrack({ id: 'b', title: 'Rainy day cafe', artist: 'Aso' }),
      makeTrack({ id: 'c', title: 'Slow morning coffee', artist: 'Kupla' }),
    ]);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Your favorites' })).toBeInTheDocument();
    // First virtualized row renders its title; the list is the favorited tracks.
    await expect(canvas.getByText('Midnight study session')).toBeInTheDocument();
  },
};

/** Library loaded but no favorites — the page header above an empty state. */
export const Empty: Story = {
  beforeEach: () => {
    seedLibrary([]);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The header stays (the empty state renders inside the same page shell)…
    await expect(canvas.getByRole('heading', { name: 'Your favorites' })).toBeInTheDocument();
    // …but the body is the empty-state prompt, not a track list.
    await expect(canvas.getByText('No favorites yet')).toBeInTheDocument();
  },
};

/** Cold start — library not loaded yet, so the skeleton shows instead of an empty flash. */
export const Loading: Story = {
  beforeEach: () => {
    seedLibrary([], false);
  },
  play: async ({ canvasElement }) => {
    // The skeleton marks itself aria-busy and renders no page header.
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading', { name: 'Your favorites' })).not.toBeInTheDocument();
  },
};
