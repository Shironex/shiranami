import type { Meta, StoryObj } from '@storybook/react-vite';
import EqBars from './EqBars';

const meta: Meta<typeof EqBars> = {
  title: 'shared/EqBars',
  component: EqBars,
};
export default meta;

type Story = StoryObj<typeof EqBars>;

export const Default: Story = {
  args: { size: 'default' },
};

export const Small: Story = {
  args: { size: 'sm' },
};
