import type { Meta, StoryObj } from '@storybook/react-vite';

import VinylVisualizer from './VinylVisualizer';

const meta: Meta<typeof VinylVisualizer> = {
  title: 'player/VinylVisualizer',
  component: VinylVisualizer,
  decorators: [
    Story => (
      <div className="h-[20rem] w-[32rem] bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VinylVisualizer>;

export const Default: Story = {
  render: () => <VinylVisualizer active />,
};
