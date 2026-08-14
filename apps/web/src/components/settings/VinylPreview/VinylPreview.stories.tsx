import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import VinylPreview from './VinylPreview';

/**
 * settings · VinylPreview. The live preview for the vinyl record display in
 * Visual effects settings: a miniature of the real VinylRecord component that
 * drops to a quarter opacity when the effect is turned off. The mock is
 * exposed as a labelled `role="img"`.
 */
const meta: Meta<typeof VinylPreview> = {
  title: 'settings/VinylPreview',
  component: VinylPreview,
  parameters: {
    // A single labelled role="img" over aria-hidden decorative disc layers —
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

type Story = StoryObj<typeof VinylPreview>;

/** Effect on — the record miniature renders at full strength. */
export const Enabled: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Vinyl preview' })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-slot="vinyl-record"]')).toBeInTheDocument();
  },
};

/** Effect off — the record dims to a quarter opacity. */
export const Disabled: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.opacity-25')).toBeInTheDocument();
  },
};
