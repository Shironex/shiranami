import type { Meta, StoryObj } from '@storybook/react-vite';

import SplashScene from './SplashScene';

const meta: Meta<typeof SplashScene> = {
  title: 'splash/SplashScene',
  component: SplashScene,
  decorators: [
    Story => (
      <div className="relative h-[36rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SplashScene>;

export const Default: Story = {
  args: {
    reducedMotion: false,
  },
};

export const ReducedMotion: Story = {
  args: {
    reducedMotion: true,
  },
};
