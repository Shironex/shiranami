import type { Meta, StoryObj } from '@storybook/react-vite';
import type { WeatherCurrent } from '@shiranami/contracts';

import WeatherRow from './WeatherRow';

const rain: WeatherCurrent = { tempC: 12, condition: 'rain', label: 'Rain' };

const meta: Meta<typeof WeatherRow> = {
  title: 'overview/WeatherRow',
  component: WeatherRow,
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

export const WithWeather: Story = {
  args: {
    weather: rain,
    isError: false,
    cityLabel: 'Kraków, PL',
  },
};

export const Unavailable: Story = {
  args: {
    weather: undefined,
    isError: true,
  },
};
