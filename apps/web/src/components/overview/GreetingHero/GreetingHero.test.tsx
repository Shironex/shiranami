import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useWeatherStore } from '@/stores/useWeatherStore';
import { useWindDownStore } from '@/stores/useWindDownStore';

import GreetingHero from './GreetingHero';

function renderHero(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <GreetingHero />
    </QueryClientProvider>
  );
  render(ui);
}

function reset(): void {
  usePlaybackStore.setState({ currentTrack: null });
  useWeatherStore.setState({ enabled: false, coords: null });
  useWindDownStore.setState({
    lastCompletion: null,
    noteAcknowledged: false,
    closingLineUntil: null,
  });
}

beforeEach(reset);
afterEach(reset);

describe('GreetingHero', () => {
  it('renders the eyebrow and a greeting headline', () => {
    renderHero();

    expect(screen.getByText('Your sanctuary')).toBeInTheDocument();
    // Greeting depends on the local hour; assert the trailing period is present.
    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('shows the no-tracks subtitle when nothing is playing', () => {
    renderHero();

    expect(
      screen.getByText('Nothing playing yet. Press play and the evening begins.')
    ).toBeInTheDocument();
  });

  it('renders the clock card without a weather row when weather is off', () => {
    renderHero();

    // The clock card is always present (weather row only when opted in).
    expect(screen.getByRole('group', { name: /Current time/ })).toBeInTheDocument();
    expect(screen.queryByText('Weather unavailable')).not.toBeInTheDocument();
  });

  it("acknowledges last night's wind-down with the drift note, exactly once", () => {
    // Drifted off eight hours ago — before this test process "launched" is not
    // possible, but the 3h same-session floor is comfortably crossed.
    useWindDownStore.setState({
      lastCompletion: {
        at: new Date(Date.now() - 8 * 3600_000).toISOString(),
        trackTitle: 'Drift',
      },
      noteAcknowledged: false,
    });

    renderHero();

    expect(screen.getByText(/You drifted off at/)).toBeInTheDocument();
    // Rendering the note consumes it — the next launch stays quiet.
    expect(useWindDownStore.getState().noteAcknowledged).toBe(true);
  });

  it('shows no drift note when the last wind-down was already acknowledged', () => {
    useWindDownStore.setState({
      lastCompletion: {
        at: new Date(Date.now() - 8 * 3600_000).toISOString(),
        trackTitle: 'Drift',
      },
      noteAcknowledged: true,
    });

    renderHero();

    expect(screen.queryByText(/You drifted off at/)).not.toBeInTheDocument();
  });
});
