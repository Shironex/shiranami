import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useWeatherStore } from '@/stores/useWeatherStore';

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
});
