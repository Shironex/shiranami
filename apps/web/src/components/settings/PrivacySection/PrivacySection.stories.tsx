import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTelemetryStore } from '@/stores/useTelemetryStore';

import PrivacySection from './PrivacySection';

const meta: Meta<typeof PrivacySection> = {
  title: 'settings/PrivacySection',
  component: PrivacySection,
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PrivacySection>;

export const Default: Story = {
  decorators: [
    Story => {
      useTelemetryStore.setState({
        enabled: false,
        performanceEnabled: false,
        bootEnabled: false,
        bootPerformanceEnabled: false,
      });
      return <Story />;
    },
  ],
};

export const Enabled: Story = {
  decorators: [
    Story => {
      useTelemetryStore.setState({
        enabled: true,
        performanceEnabled: true,
        bootEnabled: true,
        bootPerformanceEnabled: true,
      });
      return <Story />;
    },
  ],
};
