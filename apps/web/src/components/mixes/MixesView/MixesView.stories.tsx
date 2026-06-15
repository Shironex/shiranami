import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSelectionStore } from '@/stores/useSelectionStore';

import MixesView from './MixesView';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats to relax and study to',
    artist: 'Chillhop',
    album: 'Essentials',
    duration: 215,
    filePath: '/music/lofi.mp3',
    albumArt: undefined,
    playCount: 3,
    ...overrides,
  };
}

/** Seed the library the mixes view reads from. */
function seedLibrary(tracks: Track[], libraryLoaded = true): void {
  useLibraryStore.setState({ library: tracks, libraryLoaded });
}

/**
 * mixes · MixesView. The mixes overview: a page header, the curated mix grid
 * (each a clickable `MixGridRow` button that opens its mix detail), an optional
 * "for you right now" smart-mix section, and a decorative `ArtCollage` strip.
 * Reads the merged library via `useLibraryStore`; shows a skeleton before the
 * library loads and an empty state once loaded with no tracks. Stories seed the
 * library so the grid is deterministic.
 */
const meta: Meta<typeof MixesView> = {
  title: 'mixes/MixesView',
  component: MixesView,
  parameters: {
    // Header is a real <h1>, each grid card is a labelled <button>, mosaic +
    // collage art is aria-hidden, and the skeleton is aria-busy — axe clean.
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
    // Selection cleared so the bulk action bar stays hidden.
    useSelectionStore.setState({ selectedTrackIds: new Set() });
  },
};

export default meta;

type Story = StoryObj<typeof MixesView>;

/** Loaded library — page header plus the curated mix grid of openable cards. */
export const Default: Story = {
  beforeEach: () => {
    seedLibrary([
      makeTrack({ id: 'a', title: 'Midnight study session', artist: 'Idealism', playCount: 12 }),
      makeTrack({ id: 'b', title: 'Rainy day cafe', artist: 'Aso', playCount: 5 }),
      makeTrack({ id: 'c', title: 'Slow morning coffee', artist: 'Kupla', playCount: 0 }),
    ]);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Your mixes' })).toBeInTheDocument();
    // Each curated mix is a button whose accessible name starts with its title.
    await expect(canvas.getByRole('button', { name: /Most Played/ })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Recently Added/ })).toBeInTheDocument();
  },
};

/** Empty library — the mixes overview yields to a single empty state. */
export const Empty: Story = {
  beforeEach: () => {
    seedLibrary([]);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Add tracks to your library to unlock smart mixes')
    ).toBeInTheDocument();
    await expect(canvas.queryByRole('heading', { name: 'Your mixes' })).not.toBeInTheDocument();
  },
};

/** Cold start — library not loaded yet, so the skeleton shows. */
export const Loading: Story = {
  beforeEach: () => {
    seedLibrary([], false);
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('heading', { name: 'Your mixes' })).not.toBeInTheDocument();
  },
};
