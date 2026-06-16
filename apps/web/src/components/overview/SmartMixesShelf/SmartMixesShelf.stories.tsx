import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect } from 'storybook/test';
import type { SmartMixResult } from '@shiranami/contracts';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';

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

/**
 * overview · SmartMixesShelf. A compact chip row of contextual mixes generated
 * from the current hour + opted-in weather and the library's metadata. A real
 * `<h2>` ("For you right now") sits over one `<button>` chip per mix; the chip
 * label is the localized mix title and clicking it resolves the mix's track ids
 * against the in-memory library and starts playback. The whole shelf is hidden
 * when no mix qualifies. The mixes query is keyed on the current local hour, so
 * the seeded client mirrors `useSmartMixes`' key. Stories seed the library +
 * mixes cache and drive a chip into the playback store.
 */
const meta: Meta<typeof SmartMixesShelf> = {
  title: 'overview/SmartMixesShelf',
  component: SmartMixesShelf,
  parameters: {
    // Real heading; each chip is a text-labelled button with decorative icons —
    // axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => {
      // useSmartMixes keys on (hour, weather). Weather is off here, so the
      // condition segment is 'none'; the hour matches useCurrentHour's initial
      // read taken at the same render.
      useLibraryStore.setState({ library });
      usePlaybackStore.setState({ queue: [], queueIndex: 0 });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(['smartMixes', new Date().getHours(), 'none'], mixes);
      return (
        <QueryClientProvider client={client}>
          <div className="w-[40rem]">
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof SmartMixesShelf>;

/** Two mixes — the section heading + a chip each; clicking one queues its track. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'For you right now' })).toBeInTheDocument();
    // One chip per seeded mix, labelled by its localized title.
    const focusChip = canvas.getByRole('button', { name: 'Focus' });
    await expect(focusChip).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Best of the 1990s' })).toBeInTheDocument();

    // Clicking a chip resolves its track ids and starts the queue.
    await userEvent.click(focusChip);
    await expect(usePlaybackStore.getState().queue).toHaveLength(1);
  },
};
