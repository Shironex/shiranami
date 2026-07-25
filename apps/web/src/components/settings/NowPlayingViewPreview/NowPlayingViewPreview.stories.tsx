import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import NowPlayingViewPreview from './NowPlayingViewPreview';

/**
 * settings · NowPlayingViewPreview. The live preview for the immersive Now
 * Playing view in Visual effects settings: a scaled mock of the view whose
 * album-art gradient wash drops to a quarter opacity and whose expand
 * affordance loses its primary tint when the effect is turned off. The mock is
 * exposed as a labelled `role="img"`.
 */
const meta: Meta<typeof NowPlayingViewPreview> = {
  title: 'settings/NowPlayingViewPreview',
  component: NowPlayingViewPreview,
  parameters: {
    // A single labelled role="img" over decorative skeleton blocks — axe clean.
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

type Story = StoryObj<typeof NowPlayingViewPreview>;

/** Effect on — full-strength wash and a primary-tinted expand affordance. */
export const Enabled: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Now Playing preview' })).toBeInTheDocument();
    await expect(canvasElement.querySelector('.absolute.inset-0')).toHaveClass('opacity-100');
    await expect(canvasElement.querySelector('.size-8.rounded-lg')).toHaveClass('bg-primary/20');
  },
};

/** Effect off — the wash dims and the affordance falls back to muted. */
export const Disabled: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.absolute.inset-0')).toHaveClass('opacity-25');
    await expect(canvasElement.querySelector('.size-8.rounded-lg')).toHaveClass('bg-muted/20');
  },
};
