import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import SleepFadePreview from './SleepFadePreview';

/**
 * settings · SleepFadePreview. The live preview for the sleep timer's fade-out
 * in Playback settings. Fourteen fixed bars stand for the last stretch of
 * playback; the tail ramps to silence and a longer fade claims more of them, so
 * the slope visibly flattens as the slider grows. The caption names the length.
 */
const meta: Meta<typeof SleepFadePreview> = {
  title: 'settings/SleepFadePreview',
  component: SleepFadePreview,
  parameters: {
    // Decorative bars plus an aria-hidden moon glyph and one caption — axe clean.
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

type Story = StoryObj<typeof SleepFadePreview>;

/** The shortest fade — a steep two-bar drop right at the end. */
export const ShortFade: Story = {
  args: { duration: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Volume eases out over 2s when the sleep timer ends')
    ).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('.bg-primary\\/45')).toHaveLength(14);
  },
};

/** A mid-range fade — half the bars ramp down. */
export const MediumFade: Story = {
  args: { duration: 15 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Volume eases out over 15s when the sleep timer ends')
    ).toBeInTheDocument();
  },
};

/** The longest fade — the ramp spans the whole row, at its gentlest slope. */
export const LongFade: Story = {
  args: { duration: 30 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Volume eases out over 30s when the sleep timer ends')
    ).toBeInTheDocument();
  },
};
