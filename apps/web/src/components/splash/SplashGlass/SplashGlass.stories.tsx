import type { Meta, StoryObj } from '@storybook/react-vite';

import SplashGlass from './SplashGlass';

const meta: Meta<typeof SplashGlass> = {
  title: 'splash/SplashGlass',
  component: SplashGlass,
  decorators: [
    Story => (
      <div className="relative h-[36rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SplashGlass>;

export const Default: Story = {};
