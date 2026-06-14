import type { Meta, StoryObj } from '@storybook/react-vite';

import OverviewCover from './OverviewCover';

const meta: Meta<typeof OverviewCover> = {
  title: 'overview/OverviewCover',
  component: OverviewCover,
  decorators: [
    Story => (
      <div className="size-24">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof OverviewCover>;

export const Fallback: Story = {
  args: {
    title: 'Midnight Tapes',
    seed: 'Idealism',
    className: 'size-24',
  },
};

export const CjkSeed: Story = {
  args: {
    title: '夜のしらべ',
    seed: '夜のしらべ',
    className: 'size-24',
  },
};

export const WithArt: Story = {
  args: {
    title: 'Midnight Tapes',
    seed: 'Idealism',
    albumArt: 'https://placehold.co/96x96/png',
    className: 'size-24',
  },
};
