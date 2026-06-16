import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { WeatherCurrent } from '@shiranami/contracts';

import WeatherRow from './WeatherRow';

const rain: WeatherCurrent = { tempC: 12, condition: 'rain', label: 'Rain' };

/**
 * overview · WeatherRow. The clock card's weather line: the current condition +
 * rounded temperature ("Rain · 12°C") over a localized, city-prefixed flavor
 * line — or a single "Weather unavailable" line when weather is missing or the
 * query errored. Condition labels arrive in English from Open-Meteo; only the
 * chrome (flavor copy, "unavailable") is localized. This component takes the
 * weather as props — the parent GreetingHero owns the fetch. Stories cover the
 * available and unavailable branches.
 */
const meta: Meta<typeof WeatherRow> = {
  title: 'overview/WeatherRow',
  component: WeatherRow,
  parameters: {
    // Plain text lines, no controls or images — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WeatherRow>;

/** Rain at 12°C in Kraków — the weather line plus a city-prefixed flavor line. */
export const WithWeather: Story = {
  args: {
    weather: rain,
    isError: false,
    cityLabel: 'Kraków, PL',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Rain · 12°C')).toBeInTheDocument();
    // The flavor line is prefixed with the city label.
    await expect(canvas.getByText(/^Kraków, PL · /)).toBeInTheDocument();
  },
};

/** Errored fetch — the single muted "unavailable" line replaces both rows. */
export const Unavailable: Story = {
  args: {
    weather: undefined,
    isError: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Weather unavailable')).toBeInTheDocument();
    await expect(canvas.queryByText(/°C/)).not.toBeInTheDocument();
  },
};
