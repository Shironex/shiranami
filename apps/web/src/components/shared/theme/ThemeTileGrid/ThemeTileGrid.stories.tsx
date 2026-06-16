import type { Meta, StoryObj } from '@storybook/react-vite';
import ThemeTileGrid from './ThemeTileGrid';

/**
 * shared · ThemeTileGrid. The presentational theme picker grid shared by
 * Settings · Appearance and the onboarding wizard. A radiogroup of theme tiles
 * with roving arrow-key navigation; `value` marks the active tile.
 */
const meta: Meta<typeof ThemeTileGrid> = {
  title: 'shared/ThemeTileGrid',
  component: ThemeTileGrid,
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    value: 'lofi-night',
    onSelect: () => {},
    columns: 3,
  },
};

export default meta;

type Story = StoryObj<typeof ThemeTileGrid>;

export const Default: Story = {};

export const TwoColumns: Story = {
  args: { columns: 2 },
};
