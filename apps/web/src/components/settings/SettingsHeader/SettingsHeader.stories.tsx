import type { Meta, StoryObj } from '@storybook/react-vite';
import { SlidersHorizontal } from 'lucide-react';

import SettingsHeader from './SettingsHeader';

const meta = {
  title: 'settings/SettingsHeader',
  component: SettingsHeader,
} satisfies Meta<typeof SettingsHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: SlidersHorizontal,
    title: 'Equalizer',
    subtitle: 'Shape playback with a 10-band graphic EQ.',
  },
};
