import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import LibraryBannerPreview from './LibraryBannerPreview';

/**
 * settings · LibraryBannerPreview. The live preview for the library hero banner
 * in Visual effects settings. The banner stays mounted and animates its height,
 * padding and border away when the effect is off, so the album tile grid below
 * slides up rather than jumping. Exposed as a labelled `role="img"`.
 */
const meta: Meta<typeof LibraryBannerPreview> = {
  title: 'settings/LibraryBannerPreview',
  component: LibraryBannerPreview,
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

type Story = StoryObj<typeof LibraryBannerPreview>;

/** Banner on — the hero card takes its full height above the tile grid. */
export const Enabled: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Banner preview' })).toBeInTheDocument();
    await expect(canvasElement.querySelector('.bg-primary\\/10')).toHaveClass(
      'h-16',
      'opacity-100'
    );
  },
};

/** Banner off — collapsed to zero height, the grid unchanged. */
export const Disabled: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.bg-primary\\/10')).toHaveClass('h-0', 'opacity-0');
    await expect(canvasElement.querySelector('.grid')?.children).toHaveLength(3);
  },
};
