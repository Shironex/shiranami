import type { Meta, StoryObj } from '@storybook/react-vite';
import { TooltipProvider } from '@/components/ui/tooltip';

import VerticalBandSlider from './VerticalBandSlider';

const meta: Meta<typeof VerticalBandSlider> = {
  title: 'player/VerticalBandSlider',
  component: VerticalBandSlider,
  args: {
    freq: 1000,
    value: 0,
    onChange: () => {},
    label: '1 kHz band',
    bandName: 'Presence',
    gainLabel: '0.0 dB',
  },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="w-16 p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VerticalBandSlider>;

export const Default: Story = {};

export const Boosted: Story = {
  args: {
    freq: 16000,
    value: 6,
    label: '16 kHz band',
    bandName: 'Air',
    gainLabel: '+6.0 dB',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    gainLabel: '0.0 dB',
  },
};
