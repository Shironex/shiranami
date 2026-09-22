import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import SidePanelSkeleton from './SidePanelSkeleton';

/**
 * shared · SidePanelSkeleton. The Suspense fallback shown inside the docked
 * side panel while a lazy lyrics/queue chunk loads: a reserved header strip
 * (title chip + header-action chip) above six shimmering track-shaped rows, so
 * the panel frame never flashes empty. It takes no props and has no
 * interactive surface; the story pins the `aria-busy` contract and the row
 * anatomy at the panel's docked width.
 */
const meta: Meta<typeof SidePanelSkeleton> = {
  title: 'shared/SidePanelSkeleton',
  component: SidePanelSkeleton,
  parameters: {
    // The frame is aria-busy with no readable copy and no focusable
    // descendants — every placeholder is an inert div — so axe passes clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof SidePanelSkeleton>;

/** Docked width — the header strip plus six track-shaped placeholder rows. */
export const Default: Story = {
  decorators: [
    Story => (
      <div className="flex h-[32rem] w-80 flex-col border border-border/30 rounded-2xl overflow-hidden">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector('[aria-busy="true"]');
    await expect(frame).not.toBeNull();
    // Header strip + row column — the loaded panel's two regions.
    await expect(frame?.children).toHaveLength(2);
    await expect(frame?.children[1].children).toHaveLength(6);
    // Nothing is clickable while loading.
    await expect(canvasElement.querySelector('button')).toBeNull();
  },
};
