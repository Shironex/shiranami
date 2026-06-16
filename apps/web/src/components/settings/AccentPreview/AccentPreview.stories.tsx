import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import AccentPreview from './AccentPreview';

/**
 * settings · AccentPreview. A presentational sample chrome (track row, accent
 * progress bar, play button, nav pill, "on" switch graphic) rendered entirely
 * from accent tokens so it live-updates as a swatch is picked. The whole sample
 * is exposed as a single `role="img"` labelled "Accent preview"; its inner
 * pieces are purely decorative.
 */
const meta: Meta<typeof AccentPreview> = {
  title: 'settings/AccentPreview',
  component: AccentPreview,
  // Single labelled role="img"; decorative inner graphics carry no roles —
  // axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="max-w-[420px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AccentPreview>;

/** Default — the labelled preview image renders. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Accent preview' })).toBeInTheDocument();
  },
};
