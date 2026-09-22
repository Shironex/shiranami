import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { getLastCompletedWeek, listCompletedWeeks, RECAP_ARCHIVE_WEEKS } from '@/lib/recap';
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

/** Render with the derived recaps pre-seeded (closed weeks cache forever). */
function renderShelf(seed: (client: QueryClient) => void): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed(client);
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <RecapShelf />
    </QueryClientProvider>
  );
  render(ui);
}

describe('RecapShelf', () => {
  it('lists the past weeks as chips with the newest selected', () => {
    const latest = getLastCompletedWeek();
    renderShelf(client => client.setQueryData(recapKeys.week(latest.key), makeRecap(latest.key)));

    const chips = screen.getAllByRole('button');
    expect(chips).toHaveLength(RECAP_ARCHIVE_WEEKS);
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true');
    expect(chips[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it("narrates the selected week's derived recap", () => {
    const latest = getLastCompletedWeek();
    renderShelf(client => client.setQueryData(recapKeys.week(latest.key), makeRecap(latest.key)));

    expect(screen.getByRole('heading', { name: 'Recaps' })).toBeInTheDocument();
    expect(screen.getByText(/Kiro — 9 times/)).toBeInTheDocument();
  });

  it('selecting another week re-derives and narrates that week', async () => {
    const [latest, previous] = listCompletedWeeks(new Date(), 2);
    renderShelf(client => {
      client.setQueryData(recapKeys.week(latest.key), makeRecap(latest.key));
      client.setQueryData(
        recapKeys.week(previous.key),
        makeRecap(previous.key, { topTrack: { title: 'Tokyo Rain', playCount: 5 } })
      );
    });

    const chips = screen.getAllByRole('button');
    await userEvent.click(chips[1]);

    expect(chips[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Tokyo Rain — 5 times/)).toBeInTheDocument();
    expect(screen.queryByText(/Kiro/)).not.toBeInTheDocument();
  });

  it('says a quiet week is fine instead of showing a card of zeros', () => {
    const latest = getLastCompletedWeek();
    renderShelf(client =>
      client.setQueryData(
        recapKeys.week(latest.key),
        makeRecap(latest.key, {
          totalPlays: 0,
          totalMinutes: 0,
          sessionCount: 0,
          topTrack: null,
          loudestHour: null,
        })
      )
    );

    expect(screen.getByText(/A quiet week\. That's fine too\./)).toBeInTheDocument();
    expect(screen.queryByText(/sittings/)).not.toBeInTheDocument();
  });
});
