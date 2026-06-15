import type { Meta, StoryObj } from '@storybook/react-vite';
import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';

import ThemeBackgroundPreview from './ThemeBackgroundPreview';

const meta: Meta<typeof ThemeBackgroundPreview> = {
  title: 'settings/ThemeBackgroundPreview',
  component: ThemeBackgroundPreview,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ThemeBackgroundPreview>;

export const Default: Story = {
  decorators: [
    Story => {
      useThemeStore.setState({ theme: 'lofi-night' });
      useThemeBgStore.setState({ bgOpacity: 1, bgBlur: 0, bgDim: 0 });
      return <Story />;
    },
  ],
};

export const BlurredAndDimmed: Story = {
  decorators: [
    Story => {
      useThemeStore.setState({ theme: 'snow' });
      useThemeBgStore.setState({ bgOpacity: 0.8, bgBlur: 8, bgDim: 0.4 });
      return <Story />;
    },
  ],
};
