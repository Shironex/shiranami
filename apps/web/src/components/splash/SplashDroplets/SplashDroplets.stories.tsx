import type { Meta, StoryObj } from '@storybook/react-vite';

import SplashDroplets from './SplashDroplets';

const meta: Meta<typeof SplashDroplets> = {
  title: 'splash/SplashDroplets',
  component: SplashDroplets,
  decorators: [
    Story => (
      <div className="relative h-[36rem] w-full overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SplashDroplets>;

export const Default: Story = {};
