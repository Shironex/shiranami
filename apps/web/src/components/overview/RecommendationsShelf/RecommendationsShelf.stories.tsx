import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { RecommendationShelves } from '@shiranami/contracts';
import { recommendationKeys } from '@/hooks/queries/useRecommendations';

import RecommendationsShelf from './RecommendationsShelf';

const shelves: RecommendationShelves = {
  library: {
    kind: 'library',
    items: [
      { trackId: 'lt1', title: 'Drift', artist: 'Idealism', album: 'Tapes', albumArt: null },
      { trackId: 'lt2', title: 'Afterglow', artist: 'Aso', album: 'Bloom', albumArt: null },
    ],
    generatedAt: new Date().toISOString(),
    stale: false,
  },
  discover: {
    kind: 'discover',
    items: [],
    generatedAt: new Date().toISOString(),
    stale: false,
  },
};

function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(recommendationKeys.all, shelves);
  return client;
}

/**
 * overview · RecommendationsShelf. The "Recommended for you" shelf — a "From
 * your library" section of play-on-click track cards plus a "Discover new music"
 * section. The library rows read from the seeded recommendations cache; each is
 * a `<button>` labelled "Play {title}" that fires `onPlay`. The discover section
 * is gated on yt-dlp/ffmpeg being present (checked over IPC on mount); under the
 * Storybook electronAPI mock that check resolves to "needs install", so the
 * discover slot asynchronously swaps in the out-of-scope dependency-install
 * card. Stories seed the cache and drive a library row.
 */
const meta: Meta<typeof RecommendationsShelf> = {
  title: 'overview/RecommendationsShelf',
  component: RecommendationsShelf,
  // a11y stays at the global 'todo' default rather than ratcheting to 'error':
  // the discover section runs an on-mount dependency check that, under the
  // Storybook IPC mock, resolves to "needs install" and async-mounts the
  // out-of-scope DependencyInstallCard — so axe-cleanliness here depends on a
  // component outside this file's audit scope. The deterministic library
  // section (real <h2>, labelled play buttons) is asserted in `play`.
  parameters: {},
  args: { onPlay: fn(), hasLibrary: true },
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient()}>
        <div className="w-[44rem]">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RecommendationsShelf>;

/** Two library picks — the shelf heading, the section, and play-on-click. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { name: 'Recommended for you' })
    ).toBeInTheDocument();
    // The "From your library" section header is a real heading.
    await expect(canvas.getByRole('heading', { name: 'From your library' })).toBeInTheDocument();

    // Each seeded library pick is a labelled play button.
    await userEvent.click(canvas.getByRole('button', { name: 'Play Drift' }));
    await expect(args.onPlay).toHaveBeenCalledWith('lt1');
    await expect(canvas.getByRole('button', { name: 'Play Afterglow' })).toBeInTheDocument();
  },
};
