import type { Meta, StoryObj } from '@storybook/react-vite';
import { useUIStore } from '@/stores/useUIStore';

import VisualEffectsSection from './VisualEffectsSection';

const meta: Meta<typeof VisualEffectsSection> = {
  title: 'settings/VisualEffectsSection',
  component: VisualEffectsSection,
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VisualEffectsSection>;

export const Default: Story = {
  decorators: [
    Story => {
      useUIStore.setState({
        nowPlayingViewEnabled: true,
        libraryHeroCardEnabled: true,
        lowPerformanceMode: false,
        noiseOverlayEnabled: false,
      });
      return <Story />;
    },
  ],
};

export const LowPerformance: Story = {
  decorators: [
    Story => {
      useUIStore.setState({
        nowPlayingViewEnabled: false,
        libraryHeroCardEnabled: false,
        lowPerformanceMode: true,
        noiseOverlayEnabled: true,
      });
      return <Story />;
    },
  ],
};
