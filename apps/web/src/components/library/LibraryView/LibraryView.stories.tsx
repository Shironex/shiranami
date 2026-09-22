import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useViewStore } from '@/stores/useViewStore';

import LibraryView from './LibraryView';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Idealism',
    album: 'Midnight Tapes',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

const library: Track[] = [
  makeTrack({ id: 'a1', title: 'Intro', album: 'Midnight Tapes', artist: 'Idealism' }),
  makeTrack({ id: 'a2', title: 'Drift', album: 'Midnight Tapes', artist: 'Idealism' }),
  makeTrack({ id: 'b1', title: 'Cafe', album: 'Rainy Day', artist: 'Aso' }),
];

function seed(tracks: Track[], mode: 'tracks' | 'albums' = 'tracks'): void {
  useLibraryStore.setState({ library: tracks, libraryLoaded: true });
  useUIStore.setState({ libraryViewMode: mode, libraryHeroCardEnabled: false });
  useViewStore.setState({ selectedAlbumKey: null });
}

/**
 * library · LibraryView. The top-level library page: an `<h1>` title, a search
 * box, a Tracks/Albums view toggle, and either the virtualized track list, the
 * album grid, or an empty state. It reads tracks + view mode from the stores.
 * Stories seed each mode and assert the page chrome (heading, search, toggle)
 * plus the mode-specific body.
 */
const meta: Meta<typeof LibraryView> = {
  title: 'library/LibraryView',
  component: LibraryView,
  parameters: {
    // The page title is a real <h1>, the search input is aria-labelled, and the
    // view-toggle buttons carry aria-labels (decorative icons) — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    // The view hook holds a (threshold-gated) FTS search query, so stories need
    // a QueryClient even though these fixtures never cross the threshold.
    Story => (
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <div className="flex h-[40rem] flex-col">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LibraryView>;

/** Tracks mode — heading, search, toggle, and a rendered track row. */
export const Default: Story = {
  decorators: [
    Story => {
      seed(library, 'tracks');
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Your library' })).toBeInTheDocument();
    await expect(canvas.getByRole('textbox', { name: 'Search tracks...' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Tracks', pressed: true })).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Albums', pressed: false })
    ).toBeInTheDocument();
    // The virtualized list mounts rows after measuring — wait for the first.
    await expect(
      await canvas.findByRole('button', { name: /Intro\s+Idealism/ })
    ).toBeInTheDocument();
  },
};

/** Albums mode — the Albums toggle reads as pressed and the album grid renders. */
export const Albums: Story = {
  decorators: [
    Story => {
      seed(library, 'albums');
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Search albums...' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Albums', pressed: true })).toBeInTheDocument();
    await expect(await canvas.findByRole('button', { name: /Midnight Tapes/ })).toBeInTheDocument();
  },
};

/** No tracks — the full empty state with onboarding hints. */
export const Empty: Story = {
  decorators: [
    Story => {
      seed([], 'tracks');
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Your library' })).toBeInTheDocument();
    await expect(canvas.getByText('No tracks yet')).toBeInTheDocument();
    // The search box is hidden when the library is empty.
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument();
  },
};
