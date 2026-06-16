import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import GridSizeToggle from './GridSizeToggle';

const labels = {
  group: 'Grid size',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
};

/**
 * shared · GridSizeToggle. A three-state segmented control for the albums/grid
 * density (large / medium / small), each a labelled icon button. Fully
 * props-driven — the caller owns the active size and the localized labels.
 */
const meta: Meta<typeof GridSizeToggle> = {
  title: 'shared/GridSizeToggle',
  component: GridSizeToggle,
  args: {
    size: 'medium',
    onSizeChange: fn(),
    labels,
  },
};

export default meta;

type Story = StoryObj<typeof GridSizeToggle>;

/** Medium density selected. */
export const Default: Story = {};

/** Small density selected. */
export const Small: Story = {
  args: { size: 'small' },
};
