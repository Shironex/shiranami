import type { Meta, StoryObj } from '@storybook/react-vite';
import { useAccentStore, ACCENT_PRESETS } from '@/stores/useAccentStore';

import AccentColorPicker from './AccentColorPicker';

const meta: Meta<typeof AccentColorPicker> = {
  title: 'settings/AccentColorPicker',
  component: AccentColorPicker,
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AccentColorPicker>;

export const Default: Story = {
  decorators: [
    Story => {
      useAccentStore.setState({ accentColor: null });
      return <Story />;
    },
  ],
};

export const PresetSelected: Story = {
  decorators: [
    Story => {
      useAccentStore.setState({ accentColor: ACCENT_PRESETS[0].hex });
      return <Story />;
    },
  ],
};

export const CustomColor: Story = {
  decorators: [
    Story => {
      useAccentStore.setState({ accentColor: '#22d3ee' });
      return <Story />;
    },
  ],
};
