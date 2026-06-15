import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SmartMixResult } from '@shiranami/contracts';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';

import SmartMixesShelf from './SmartMixesShelf';

const mixes: SmartMixResult[] = [
  {
    id: 'focus',
    kind: 'focus',
    titleKey: 'smart.focus',
    descKey: 'smart.focusDesc',
    trackIds: ['t1'],
  },
  {
    id: 'decade-1990',
    kind: 'decade',
    titleKey: 'smart.decade',
    descKey: 'smart.decadeDesc',
    decade: 1990,
    trackIds: ['t1'],
  },
];

const library: Track[] = [
  {
    id: 't1',
    title: 'Drift',
    artist: 'Idealism',
    album: 'Tapes',
    duration: 200,
    filePath: '/a.mp3',
  },
];

function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useLibraryStore.setState({ library });
  client.setQueryData(['smartMixes', new Date().getHours(), 'none'], mixes);
  return client;
}

const meta: Meta<typeof SmartMixesShelf> = {
  title: 'overview/SmartMixesShelf',
  component: SmartMixesShelf,
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient()}>
        <div className="w-[40rem]">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SmartMixesShelf>;

export const Default: Story = {};
