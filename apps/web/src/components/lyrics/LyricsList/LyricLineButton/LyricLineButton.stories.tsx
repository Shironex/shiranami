import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import LyricLineButton from './LyricLineButton';

const SIZED_CLASSES = {
  baseClassName: 'block w-full text-left leading-relaxed font-medium text-base px-1',
  activeClassName: 'text-foreground font-semibold',
  pastClassName: 'text-foreground/50',
  idleClassName: 'text-foreground/30',
};

/**
 * lyrics · LyricLineButton. A single line in the synced-lyrics column, rendered
 * once per line on a hot path (the list re-renders on every playback tick, so
 * the component is memoized). It is a plain `<button>` named by its own lyric
 * text; clicking it seeks playback to that line's timestamp. The only visual
 * variation is the three-way past / active / idle styling driven by
 * `isActive` + `isPast` — one story each.
 */
const meta: Meta<typeof LyricLineButton> = {
  title: 'lyrics/LyricLineButton',
  component: LyricLineButton,
  parameters: {
    // A real <button> named by its lyric text, nothing decorative — axe clean.
    a11y: { test: 'error' },
  },
  args: {
    text: 'Coffee going cold again',
    time: 8,
    isActive: false,
    isPast: false,
    onSelect: fn(),
    ...SIZED_CLASSES,
  },
  decorators: [
    Story => (
      <div className="w-[28rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LyricLineButton>;

/** The line currently being sung — clicking it seeks to its timestamp. */
export const Active: Story = {
  args: {
    isActive: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const line = canvas.getByRole('button', { name: 'Coffee going cold again' });

    await expect(line).toHaveClass('font-semibold');

    await userEvent.click(line);
    await expect(args.onSelect).toHaveBeenCalledWith(8);
  },
};

/** A line that has already played — dimmed, but still seekable. */
export const Past: Story = {
  args: {
    isPast: true,
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const line = canvas.getByRole('button', { name: 'Coffee going cold again' });

    await expect(line).toHaveClass('text-foreground/50');
    await expect(line).not.toHaveClass('font-semibold');

    await userEvent.click(line);
    await expect(args.onSelect).toHaveBeenCalledWith(8);
  },
};

/** A line still ahead of playback — the faintest of the three states. */
export const Idle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const line = canvas.getByRole('button', { name: 'Coffee going cold again' });

    await expect(line).toHaveClass('text-foreground/30');
    await expect(line).not.toHaveClass('text-foreground/50');
  },
};
