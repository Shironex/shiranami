import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import LoudnessPreview from './LoudnessPreview';

/**
 * settings · LoudnessPreview. The live preview for volume leveling in Playback
 * settings. Five illustrative tracks stand at their own perceived loudness; a
 * dashed line marks the target LUFS and rides up as the slider gets louder.
 * Turning leveling on animates every bar onto that line, which is the whole
 * point of the setting made visible.
 */
const meta: Meta<typeof LoudnessPreview> = {
  title: 'settings/LoudnessPreview',
  component: LoudnessPreview,
  parameters: {
    // Decorative bars plus one text label — no interactive controls, axe clean.
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

type Story = StoryObj<typeof LoudnessPreview>;

/** Leveling off — the bars keep their own varying heights. */
export const Off: Story = {
  args: { enabled: false, target: -14 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('Tracks play at their original, varying loudness.')
    ).toBeInTheDocument();
    const bars = canvasElement.querySelectorAll('.bg-primary\\/45');
    await expect(bars).toHaveLength(5);
  },
};

/** Leveling on at -14 LUFS — every bar lands on the target line. */
export const Leveled: Story = {
  args: { enabled: true, target: -14 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('-14 LUFS')).toBeInTheDocument();
    await expect(
      canvas.getByText('Tracks are nudged to a consistent target loudness.')
    ).toBeInTheDocument();
  },
};

/** The quietest allowed target — the line sits on the column baseline. */
export const QuietTarget: Story = {
  args: { enabled: true, target: -23 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('-23 LUFS')).toBeInTheDocument();
  },
};
