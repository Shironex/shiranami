import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import AlbumSortControl from './AlbumSortControl';

const labels = {
  button: 'Sort albums',
  modeName: 'Name',
  modeArtist: 'Artist',
  modeYear: 'Year',
  modeRecentlyAdded: 'Recently added',
  orderAsc: 'Ascending',
  orderDesc: 'Descending',
};

/**
 * shared · AlbumSortControl. A popover sort control for the albums grid: a
 * trigger summarizing the active mode, then a mode picker (Name / Artist / Year
 * / Recently added) over an ascending/descending order toggle. Fully
 * props-driven — the caller owns the mode/order state and the localized labels.
 */
const meta: Meta<typeof AlbumSortControl> = {
  title: 'shared/AlbumSortControl',
  component: AlbumSortControl,
  args: {
    mode: 'name',
    order: 'asc',
    onModeChange: fn(),
    onOrderChange: fn(),
    labels,
  },
};

export default meta;

type Story = StoryObj<typeof AlbumSortControl>;

/** Sorting by name, ascending — open the popover to switch mode/order. */
export const Default: Story = {};

/** Sorting by recently-added, descending. */
export const RecentlyAddedDesc: Story = {
  args: { mode: 'recentlyAdded', order: 'desc' },
};
