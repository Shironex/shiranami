import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEqStore } from '@/stores/useEqStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import EqualizerSection from './EqualizerSection';

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const SMILE = [6, 4, 1, -2, -3, -2, 1, 3, 5, 6];

const meta: Meta<typeof EqualizerSection> = {
  title: 'settings/EqualizerSection',
  component: EqualizerSection,
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="max-w-[640px] p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof EqualizerSection>;

export const Enabled: Story = {
  decorators: [
    Story => {
      useEqStore.setState({ enabled: true, preset: 'flat', gains: FLAT, preampDb: 0 });
      return <Story />;
    },
  ],
};

export const Custom: Story = {
  decorators: [
    Story => {
      useEqStore.setState({ enabled: true, preset: 'custom', gains: SMILE, preampDb: 2 });
      return <Story />;
    },
  ],
};

export const Disabled: Story = {
  decorators: [
    Story => {
      useEqStore.setState({ enabled: false, preset: 'flat', gains: FLAT, preampDb: 0 });
      return <Story />;
    },
  ],
};
