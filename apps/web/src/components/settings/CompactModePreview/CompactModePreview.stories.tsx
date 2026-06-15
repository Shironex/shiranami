import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCompactStore } from '@/stores/useCompactStore';

import CompactModePreview from './CompactModePreview';

const meta: Meta<typeof CompactModePreview> = {
  title: 'settings/CompactModePreview',
  component: CompactModePreview,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CompactModePreview>;

export const Default: Story = {};

export const LargeWithLyrics: Story = {
  decorators: [
    Story => {
      useCompactStore.setState({
        compactSize: 'lg',
        compactFontSize: 'lg',
        compactShowFavorite: true,
        compactShowLyrics: true,
      });
      return <Story />;
    },
  ],
};
