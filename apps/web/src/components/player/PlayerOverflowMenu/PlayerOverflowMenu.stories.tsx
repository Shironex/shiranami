import type { Meta, StoryObj } from '@storybook/react-vite';
import { useInterfaceStore } from '@/stores/useInterfaceStore';
import { useUIStore } from '@/stores/useUIStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import PlayerOverflowMenu from './PlayerOverflowMenu';

/** Seed the element-visibility + visualizer stores the menu reads. */
function seedMenu(visualizerOn: boolean): void {
  useInterfaceStore.setState({
    playerSleepTimer: true,
    playerEqualizer: true,
    playerCompactButton: true,
    playerVisualizerButton: true,
  });
  useUIStore.setState({ showVisualizer: visualizerOn });
}

const meta: Meta<typeof PlayerOverflowMenu> = {
  title: 'player/PlayerOverflowMenu',
  component: PlayerOverflowMenu,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="flex h-40 items-center justify-center">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PlayerOverflowMenu>;

export const Default: Story = {
  decorators: [
    Story => {
      seedMenu(false);
      return <Story />;
    },
  ],
};

export const VisualizerActive: Story = {
  decorators: [
    Story => {
      seedMenu(true);
      return <Story />;
    },
  ],
};
