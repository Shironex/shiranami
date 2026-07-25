import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import ResumePreview from './ResumePreview';

/**
 * settings · ResumePreview. The live preview for "remember playback position"
 * in Playback settings: a mock track row whose elapsed label and progress fill
 * jump between a saved moment (`1:42` / 44%) and a cold start (`0:00` / 0%) as
 * the toggle flips, with a caption spelling out what happens on relaunch.
 * Presentational — the `enabled` prop is the only input.
 */
const meta: Meta<typeof ResumePreview> = {
  title: 'settings/ResumePreview',
  component: ResumePreview,
  parameters: {
    // Plain text and decorative skeleton bars, no interactive controls — axe clean.
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

type Story = StoryObj<typeof ResumePreview>;

/** Resume on — the saved position and a part-filled progress bar. */
export const Enabled: Story = {
  args: { enabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Midnight Rain')).toBeInTheDocument();
    await expect(canvas.getByText('1:42')).toBeInTheDocument();
    await expect(canvas.getByText('Relaunch resumes from the saved moment.')).toBeInTheDocument();
    // Assert the inline style the component sets, not the computed one — a real
    // browser resolves the percentage to a pixel width, which `toHaveStyle` compares against.
    const fill = canvasElement.querySelector<HTMLElement>('.bg-primary\\/55');
    await expect(fill).toBeInTheDocument();
    await expect(fill?.style.width).toBe('44%');
  },
};

/** Resume off — the position zeroes out and the bar empties. */
export const Disabled: Story = {
  args: { enabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('0:00')).toBeInTheDocument();
    await expect(
      canvas.getByText('Relaunch starts the track from the beginning.')
    ).toBeInTheDocument();
    // Inline style, not computed — see the Enabled story.
    const fill = canvasElement.querySelector<HTMLElement>('.bg-primary\\/55');
    await expect(fill).toBeInTheDocument();
    await expect(fill?.style.width).toBe('0%');
  },
};
