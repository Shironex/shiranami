import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import LowPerformancePreview from './LowPerformancePreview';

/**
 * settings · LowPerformancePreview. The live preview for low-performance mode
 * in Visual effects settings. An eight-band equalizer mock stands in for the
 * app's animated surfaces: turning the mode on dims it, flips the status line to
 * "Reduced rendering" and recolors the badge amber. Exposed as a labelled
 * `role="img"`.
 */
const meta: Meta<typeof LowPerformancePreview> = {
  title: 'settings/LowPerformancePreview',
  component: LowPerformancePreview,
  parameters: {
    // A single labelled role="img" over decorative bars plus two text labels —
    // axe clean.
    a11y: { test: 'error' },
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

type Story = StoryObj<typeof LowPerformancePreview>;

/** Mode off — the visualizer renders at full brightness. */
export const FullRendering: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Performance preview' })).toBeInTheDocument();
    await expect(canvas.getByText('Full visualizer')).toBeInTheDocument();
    await expect(canvasElement.querySelector('.grid')).not.toHaveClass('opacity-35');
  },
};

/** Mode on — the visualizer dims and the badge turns amber. */
export const ReducedRendering: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Reduced rendering')).toBeInTheDocument();
    await expect(canvas.getByText('Reduced')).toHaveClass('bg-amber-500/15');
    await expect(canvasElement.querySelector('.grid')).toHaveClass('opacity-35');
  },
};
