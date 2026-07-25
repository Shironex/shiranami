import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import NoiseOverlayPreview from './NoiseOverlayPreview';

/**
 * settings · NoiseOverlayPreview. The live preview for the grain texture in
 * Visual effects settings. A gradient wash stands in for an app surface; the
 * dotted noise layer is mounted over it only while the effect is on, and the
 * status line names the current state. Exposed as a labelled `role="img"`.
 */
const meta: Meta<typeof NoiseOverlayPreview> = {
  title: 'settings/NoiseOverlayPreview',
  component: NoiseOverlayPreview,
  parameters: {
    // A single labelled role="img" over decorative layers plus one text line —
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

type Story = StoryObj<typeof NoiseOverlayPreview>;

/** Texture on — the grain layer sits over the wash. */
export const Enabled: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Noise preview' })).toBeInTheDocument();
    await expect(canvas.getByText('Texture enabled')).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('.absolute.inset-0')).toHaveLength(2);
  },
};

/** Texture off — the grain layer is unmounted, leaving the bare wash. */
export const Disabled: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Texture disabled')).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('.absolute.inset-0')).toHaveLength(1);
  },
};
