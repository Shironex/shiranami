import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import MixesViewSkeleton from './MixesViewSkeleton';

/**
 * mixes · MixesViewSkeleton. The cold-start placeholder for the mixes overview:
 * a title bar and six pulsing mix rows, sized to the curated grid so the real
 * view settles into place without a jump. It takes no props and has exactly one
 * state — there is no second variant to show, and nothing to interact with, so
 * the single story's play function asserts the loading affordance (`aria-busy`,
 * placeholder count, no leaked text) rather than driving input.
 */
const meta: Meta<typeof MixesViewSkeleton> = {
  title: 'mixes/MixesViewSkeleton',
  component: MixesViewSkeleton,
  parameters: {
    // Decorative blocks only, under a single aria-busy region — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[28rem] w-[36rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MixesViewSkeleton>;

/** The only state: six placeholder rows beneath a placeholder page title. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvasElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('.rounded-xl')).toHaveLength(6);
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(25);

    // Nothing readable or focusable leaks out of a loading placeholder.
    await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};
