import type { Meta, StoryObj } from '@storybook/react-vite';
import { useThemeStore } from '@/stores/useThemeStore';
import { useThemeBgStore } from '@/stores/useThemeBgStore';
import { useAccentStore } from '@/stores/useAccentStore';
import { useUIStore } from '@/stores/useUIStore';

import AppearanceSection from './AppearanceSection';

const meta: Meta<typeof AppearanceSection> = {
  title: 'settings/AppearanceSection',
  component: AppearanceSection,
  decorators: [
    Story => (
      <div className="max-w-[680px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AppearanceSection>;

export const Default: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ uiScale: 100 });
      useThemeStore.setState({ theme: 'none' });
      useAccentStore.setState({ accentColor: null });
      return <Story />;
    },
  ],
};

export const ThemedWithAccent: Story = {
  decorators: [
    Story => {
      useUIStore.setState({ uiScale: 110 });
      useThemeStore.setState({ theme: 'lofi-night' });
      useThemeBgStore.setState({ bgOpacity: 0.85, bgBlur: 6, bgDim: 0.3 });
      useAccentStore.setState({ accentColor: '#22d3ee' });
      return <Story />;
    },
  ],
};
