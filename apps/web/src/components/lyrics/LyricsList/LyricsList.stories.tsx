import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { LyricLine } from '@/hooks/queries/useLyrics';

import LyricsList from './LyricsList';

const LINES: LyricLine[] = [
  { time: 0, text: 'Sunlight through the curtains' },
  { time: 4, text: 'A quiet morning hum' },
  { time: 8, text: 'Coffee going cold again' },
  { time: 12, text: 'And the day has just begun' },
  { time: 16, text: 'Lo-fi drifting in the air' },
];

const SIZED_CLASSES = {
  baseClassName: 'block w-full text-left leading-relaxed font-medium text-base px-1',
  activeClassName: 'text-foreground font-semibold',
  pastClassName: 'text-foreground/50',
  idleClassName: 'text-foreground/30',
};

/**
 * lyrics · LyricsList. The scrollable synced-lyrics column: one seekable
 * `<button>` per line (named by its text), styled past / active / idle off
 * `activeIndex`, with the active line scrolled into view. Clicking a line calls
 * `onLineClick` with that line's timestamp. Stories render a short line list and
 * drive a click.
 */
const meta: Meta<typeof LyricsList> = {
  title: 'lyrics/LyricsList',
  component: LyricsList,
  parameters: {
    // Each line is a real <button> named by its lyric text — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    lines: LINES,
    activeIndex: 2,
    onLineClick: fn(),
    spacingClassName: 'space-y-4',
    ...SIZED_CLASSES,
  },
  decorators: [
    Story => (
      <div className="flex h-[24rem] w-[28rem] flex-col p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LyricsList>;

/** Default — clicking a line seeks to its timestamp. */
export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Coffee going cold again' })
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'A quiet morning hum' }));
    await expect(args.onLineClick).toHaveBeenCalledWith(4);
  },
};
