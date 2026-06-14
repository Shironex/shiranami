import type { Meta, StoryObj } from '@storybook/react-vite';

import SearchView from './SearchView';

const meta: Meta<typeof SearchView> = {
  title: 'search/SearchView',
  component: SearchView,
  decorators: [
    Story => (
      <div className="flex h-[40rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SearchView>;

export const Default: Story = {};
