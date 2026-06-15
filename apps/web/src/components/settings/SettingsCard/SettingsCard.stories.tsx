import type { Meta, StoryObj } from '@storybook/react-vite';
import { SlidersHorizontal } from 'lucide-react';

import SettingsCard, { SettingsToggleRow, SettingsSelectRow } from './SettingsCard';

const meta = {
  title: 'settings/SettingsCard',
  component: SettingsCard,
} satisfies Meta<typeof SettingsCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: SlidersHorizontal,
    title: 'Equalizer',
    subtitle: 'Shape playback with a 10-band graphic EQ.',
    children: (
      <>
        <SettingsToggleRow label="Enable equalizer" checked onCheckedChange={() => {}} />
        <SettingsSelectRow
          label="Preset"
          value="flat"
          onValueChange={() => {}}
          options={[
            { value: 'flat', label: 'Flat' },
            { value: 'bass', label: 'Bass boost' },
          ]}
          divider
        />
      </>
    ),
  },
};
