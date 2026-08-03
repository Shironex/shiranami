import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, userEvent, expect } from 'storybook/test';
import { listCompletedWeeks } from '@/lib/recap';
import { recapKeys, type WeeklyRecap } from '@/hooks/queries/useRecap';

import RecapShelf from './RecapShelf';

function makeRecap(weekKey: string, overrides: Partial<WeeklyRecap> = {}): WeeklyRecap {
  return {
    weekKey,
    totalPlays: 42,
    totalMinutes: 400,
    sessionCount: 11,
    topTrack: { title: 'Kiro', playCount: 9 },
    loudestHour: 23,
    ...overrides,
  };
}

/**
 * history · RecapShelf. The recap archive: the last few completed weeks as
 * `aria-pressed` chips, with the selected week's recap re-derived from history
 * below (a closed `since`/`until` window per week, cached forever). A week
 * with nothing played gets an honest quiet-week line rather than a card of
 * zeros. Stories seed the query cache at the exact per-week keys, mirroring
 * how closed weeks never refetch in the app.
 */
const meta: Meta<typeof RecapShelf> = {
  title: 'history/RecapShelf',
  component: RecapShelf,
  parameters: {
    // Real heading; chips are labelled toggle buttons; the card is prose —
    // axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => {
      const [client] = useState(() => {
        const created = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const [latest, previous] = listCompletedWeeks(new Date(), 2);
        created.setQueryData(recapKeys.week(latest.key), makeRecap(latest.key));
        created.setQueryData(
          recapKeys.week(previous.key),
          makeRecap(previous.key, {
            totalPlays: 0,
            totalMinutes: 0,
            sessionCount: 0,
            topTrack: null,
            loudestHour: null,
          })
        );
        return created;
      });
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

type Story = StoryObj<typeof RecapShelf>;

/** Newest week selected — chips row plus the derived card. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Recaps' })).toBeInTheDocument();
    const chips = canvas.getAllByRole('button');
    await expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByText(/Kiro — 9 times/)).toBeInTheDocument();
  },
};

/** Selecting a quiet week degrades honestly — a line, not a card of zeros. */
export const QuietWeek: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chips = canvas.getAllByRole('button');
    await userEvent.click(chips[1]);
    await expect(await canvas.findByText(/A quiet week\./)).toBeInTheDocument();
    await expect(canvas.queryByText(/sittings/)).not.toBeInTheDocument();
  },
};
