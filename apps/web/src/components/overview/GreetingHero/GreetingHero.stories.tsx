import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useWeatherStore } from '@/stores/useWeatherStore';

import GreetingHero from './GreetingHero';

/**
 * overview · GreetingHero. The Overview hero: a greeting headline (`<h2>`) + a
 * session-summary line on the left, and the live `ClockCard` on the right. The
 * greeting and decorative kanji watermark depend on the current time of day, and
 * the session line depends on the playback store; the weather row only appears
 * when the user has opted in. Stories seed the playback + weather stores to the
 * "nothing playing, weather off" baseline so the deterministic chrome — eyebrow,
 * greeting heading, no-tracks subtitle, and the labelled clock group — can be
 * asserted without a fixed clock.
 */
const meta: Meta<typeof GreetingHero> = {
  title: 'overview/GreetingHero',
  component: GreetingHero,
  parameters: {
    // The greeting is a real <h2>, the watermark + eyebrow dot are decorative,
    // and the clock group is labelled (weather off by default) — axe passes
    // clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => {
      // Baseline: nothing playing, weather off — matches the no-tracks subtitle
      // and suppresses the weather row, so the hero renders deterministically.
      useWeatherStore.setState({ enabled: false, coords: null });
      usePlaybackStore.setState({ currentTrack: null });
      const [client] = useState(
        () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
      );
      return (
        <QueryClientProvider client={client}>
          <div className="w-[48rem]">
            <Story />
          </div>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;

type Story = StoryObj<typeof GreetingHero>;

/** Nothing playing, weather off — eyebrow, greeting heading, and the clock group. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Your sanctuary')).toBeInTheDocument();
    // The greeting copy varies by hour; assert the heading exists rather than a
    // specific greeting string.
    await expect(canvas.getByRole('heading')).toBeInTheDocument();
    await expect(
      canvas.getByText('Nothing playing yet. Press play and the evening begins.')
    ).toBeInTheDocument();
    // The clock card is always present; the weather row is opt-in (off here).
    await expect(canvas.getByRole('group', { name: /Current time/ })).toBeInTheDocument();
    await expect(canvas.queryByText('Weather unavailable')).not.toBeInTheDocument();
  },
};
