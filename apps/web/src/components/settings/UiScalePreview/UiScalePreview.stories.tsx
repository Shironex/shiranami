import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import UiScalePreview from './UiScalePreview';

/**
 * settings · UiScalePreview. Side-by-side sample cards comparing the default UI
 * scale against the chosen one, so the interface-scale slider's effect stays
 * legible while the rest of the settings page is unaffected. The comparison
 * tile is grouped under `role="img"` named "Scale preview"; each card shows a
 * sample track title + artist sized by an inline px factor. Driven by the
 * `scale` prop (a percentage).
 */
const meta: Meta<typeof UiScalePreview> = {
  title: 'settings/UiScalePreview',
  component: UiScalePreview,
  args: { scale: 120 },
  parameters: {
    // The preview groups its sample cards under a named role="img"; the sample
    // text uses standard foreground/muted tokens on a surface — axe passes clean.
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

type Story = StoryObj<typeof UiScalePreview>;

/** 120% scale — the named comparison image and a sample title both render. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Scale preview' })).toBeInTheDocument();
    // Each card renders the sample title; the active card mirrors it at the factor.
    await expect(canvas.getAllByText('Evening Rain').length).toBeGreaterThan(0);
  },
};

/** A larger 150% scale still presents the same named comparison image. */
export const Enlarged: Story = {
  args: { scale: 150 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Scale preview' })).toBeInTheDocument();
  },
};
