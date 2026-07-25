import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import CompletionFlourish from './CompletionFlourish';

/**
 * onboarding · CompletionFlourish. The send-off that plays when the wizard is
 * finished from its last step: four music notes drift up out of the Finish
 * button, staggered in size, delay and tilt, fading with the wizard's own 520ms
 * fog-out. It has no interactive surface and no variants of its own — the wizard
 * decides whether to mount it (never on skip, never under reduced motion), so
 * the stories show the cluster in isolation and in the footer composition it
 * actually ships in.
 */
const meta: Meta<typeof CompletionFlourish> = {
  title: 'onboarding/CompletionFlourish',
  component: CompletionFlourish,
  parameters: {
    // Pure aria-hidden decoration: no roles, names, or text reach the a11y tree,
    // so axe passes clean.
    a11y: { test: 'error' },
  },
};

export default meta;

type Story = StoryObj<typeof CompletionFlourish>;

/** The bare cluster over an empty host — four notes, four sizes, all decorative. */
export const Default: Story = {
  decorators: [
    Story => (
      <div className="relative flex h-64 w-full items-end justify-center bg-background pb-8">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('svg')).toHaveLength(4);
    // The whole layer is hidden from assistive tech.
    await expect(canvasElement.querySelector('[aria-hidden="true"]')).not.toBeNull();
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();
  },
};

/**
 * The shipped composition — mounted in the wizard footer's `relative` host so
 * the notes rise out of the Finish button, which stays clickable underneath.
 */
export const OverFinishButton: Story = {
  decorators: [
    Story => (
      <div className="flex h-64 w-full items-end justify-center bg-background pb-8">
        <div className="relative">
          <Story />
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Start listening
          </button>
        </div>
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button', { name: 'Start listening' });
    await expect(button).toBeInTheDocument();
    // The flourish overlays the button but never swallows its clicks.
    const layer = canvasElement.querySelector('[aria-hidden="true"]');
    await expect(layer).toHaveClass('pointer-events-none');
    await expect(canvasElement.querySelectorAll('svg')).toHaveLength(4);
  },
};
