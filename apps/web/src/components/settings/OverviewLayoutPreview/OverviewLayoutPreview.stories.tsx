import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { useInterfaceStore, INTERFACE_DEFAULTS } from '@/stores/useInterfaceStore';

import OverviewLayoutPreview from './OverviewLayoutPreview';

/** Every collapsible widget block shares this frame; the greeting hero does not. */
const BLOCK = '.overflow-hidden.rounded-lg';

/**
 * settings · OverviewLayoutPreview. A scaled mock of the Overview page shown in
 * the Interface settings section. It reads the live `useInterfaceStore`, so each
 * widget folds away (max-height + opacity) the moment its toggle flips, and the
 * clock/albums column — and with it the whole week grid — unmounts once nothing
 * is left to show. `highlightedKey` mirrors the settings row under the cursor
 * and rings the matching block. The greeting hero is always present.
 */
const meta: Meta<typeof OverviewLayoutPreview> = {
  title: 'settings/OverviewLayoutPreview',
  component: OverviewLayoutPreview,
  parameters: {
    // A single labelled role="img" over decorative skeleton blocks — axe clean.
    a11y: { test: 'error' },
  },
  beforeEach: () => {
    useInterfaceStore.setState({ ...INTERFACE_DEFAULTS });
  },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof OverviewLayoutPreview>;

/** Shipping defaults — every widget on, so all seven blocks are expanded. */
export const AllWidgets: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Overview preview' })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll(BLOCK)).toHaveLength(7);
  },
};

/** Stats off — the block stays mounted so the fold animates, at zero height. */
export const StatsHidden: Story = {
  beforeEach: () => {
    useInterfaceStore.setState({ ...INTERFACE_DEFAULTS, overviewStats: false });
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll(BLOCK)[0]).toHaveClass('max-h-0', 'opacity-0');
  },
};

/** Week-grid widgets all off — the grid row unmounts, leaving four shelves. */
export const WeekGridHidden: Story = {
  beforeEach: () => {
    useInterfaceStore.setState({
      ...INTERFACE_DEFAULTS,
      overviewTopWeek: false,
      overviewClock: false,
      overviewTopAlbums: false,
    });
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll(BLOCK)).toHaveLength(4);
  },
};

/** Hovering the "Smart mixes" settings row rings that block, and only that one. */
export const SpotlightedWidget: Story = {
  args: { highlightedKey: 'overviewMixes' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.ring-1')).toHaveLength(1);
    await expect(canvasElement.querySelectorAll(BLOCK)[4]).toHaveClass('ring-1');
  },
};
