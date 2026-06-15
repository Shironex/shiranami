import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSleepTimerStore } from '@/stores/useSleepTimerStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import { SleepTimer } from './index';

/** Seed the sleep-timer store the trigger/popover reflect. */
function seedTimer(endTime: number | null, remaining: number): void {
  useSleepTimerStore.setState({ endTime, remaining });
}

const meta: Meta<typeof SleepTimer> = {
  title: 'player/SleepTimer',
  component: SleepTimer,
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SleepTimer>;

export const Idle: Story = {
  decorators: [
    Story => {
      seedTimer(null, 0);
      return <Story />;
    },
  ],
};

export const Running: Story = {
  decorators: [
    Story => {
      seedTimer(Date.now() + 1_800_000, 1800);
      return <Story />;
    },
  ],
};
