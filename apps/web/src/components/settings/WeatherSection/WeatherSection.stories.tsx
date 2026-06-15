import type { Meta, StoryObj } from '@storybook/react-vite';
import { useWeatherStore } from '@/stores/useWeatherStore';

import WeatherSection from './WeatherSection';

const meta: Meta<typeof WeatherSection> = {
  title: 'settings/WeatherSection',
  component: WeatherSection,
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

export const Default: Story = {
  decorators: [
    Story => {
      useWeatherStore.setState({ enabled: false, coords: null });
      return <Story />;
    },
  ],
};

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
};
