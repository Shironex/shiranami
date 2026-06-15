import type { Meta, StoryObj } from '@storybook/react-vite';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEqStore } from '@/stores/useEqStore';

import EqualizerPanel from './EqualizerPanel';

function seedEq(enabled: boolean): void {
  useEqStore.setState({
    enabled,
    preset: enabled ? 'rock' : 'flat',
    gains: enabled ? [3, 2, 1, 0, -1, 0, 1, 2, 3, 4] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preampDb: 0,
    activeCustomId: null,
  });
}

const meta: Meta<typeof EqualizerPanel> = {
  title: 'player/EqualizerPanel',
  component: EqualizerPanel,
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="p-8">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof EqualizerPanel>;

export const TriggerEnabled: Story = {
  decorators: [
    Story => {
      seedEq(true);
      return <Story />;
    },
  ],
};

export const InlineSection: Story = {
  args: { inline: true, layout: 'section' },
  decorators: [
    Story => {
      seedEq(true);
      return (
        <div className="w-[420px]">
          <Story />
        </div>
      );
    },
  ],
};
