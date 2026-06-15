import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, waitFor } from 'storybook/test';
import { useWeatherStore } from '@/stores/useWeatherStore';

import WeatherSection from './WeatherSection';

/**
 * settings · WeatherSection. Opt-in weather card for the Overview clock. A real
 * `<h3>` heading ("Weather on Overview") over an enable switch (labelled via
 * `aria-labelledby`); turning it on reveals a city search form — a labelled
 * `<input>` ("City") and a submit button — plus, once a city is chosen, a
 * current-city chip with a "Clear city" button. The toggle and city live in the
 * weather store, which stories seed on entry. Copy comes from the `overview`
 * namespace.
 */
const meta: Meta<typeof WeatherSection> = {
  title: 'settings/WeatherSection',
  component: WeatherSection,
  parameters: {
    // Real heading, a named switch, a labelled city input, an icon button with
    // an aria-label, and an info callout with a decorative icon — axe clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WeatherSection>;

/** Disabled: just the heading and the gating switch — no city search yet. */
export const Default: Story = {
  decorators: [
    Story => {
      useWeatherStore.setState({ enabled: false, coords: null });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Weather on Overview' })).toBeInTheDocument();
    const toggle = canvas.getByRole('switch', { name: 'Show weather on Overview' });
    await expect(toggle).not.toBeChecked();
    // The city search is gated behind the toggle.
    await expect(canvas.queryByLabelText('City')).not.toBeInTheDocument();

    // Enabling it reveals the city search input.
    await userEvent.click(toggle);
    await waitFor(() => expect(canvas.getByLabelText('City')).toBeInTheDocument());
  },
};

/** Enabled with a chosen city: the current-city chip and clear button render. */
export const WithCity: Story = {
  decorators: [
    Story => {
      useWeatherStore.setState({
        enabled: true,
        coords: { lat: 35.68, lon: 139.69, label: 'Tokyo, Japan' },
      });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Showing weather for Tokyo, Japan')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Clear city' })).toBeInTheDocument();
    await expect(canvas.getByLabelText('City')).toBeInTheDocument();
  },
};
