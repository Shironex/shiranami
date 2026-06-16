import type { Meta, StoryObj } from '@storybook/react-vite';
import DownloadProgressBar from './DownloadProgressBar';

const meta: Meta<typeof DownloadProgressBar> = {
  title: 'shared/DownloadProgressBar',
  component: DownloadProgressBar,
  decorators: [
    Story => (
      <div className="relative h-12 w-80 rounded-xl border border-border/20">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof DownloadProgressBar>;

export const Determinate: Story = {
  args: { progress: 42, ariaLabel: 'Download progress' },
};

export const Indeterminate: Story = {
  args: {},
};
