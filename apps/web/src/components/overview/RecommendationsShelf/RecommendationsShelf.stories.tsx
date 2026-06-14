import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const meta: Meta<typeof RecommendationsShelf> = {
  title: 'overview/RecommendationsShelf',
  component: RecommendationsShelf,
  args: { onPlay: () => {}, hasLibrary: true },
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

export const Default: Story = {};
