import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import HistoryEmptyState from './HistoryEmptyState';

/**
 * history · HistoryEmptyState. The dashed-border placeholder a history section
 * renders when its range has no data — a `title` line over a smaller `copy`
 * line. Pure presentational: it has no interactive elements, no roles, and no
 * images, so stories assert the literal title + copy text it was handed.
 */
const meta: Meta<typeof HistoryEmptyState> = {
  title: 'history/HistoryEmptyState',
  component: HistoryEmptyState,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): both
  // lines render with sub-opacity muted tokens (`text-muted-foreground/65`) over
  // a translucent `bg-background/20`, so axe's color-contrast ratio is
  // non-deterministic against the layered backdrop. The visible content (title +
  // copy) is asserted in `play` instead.
  args: {
    title: 'No top tracks in this range',
    copy: 'Once enough listens are logged in the selected period, your most-played tracks will surface here.',
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

type Story = StoryObj<typeof HistoryEmptyState>;

/** The default placeholder — its title and copy both render. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(args.title)).toBeInTheDocument();
    await expect(canvas.getByText(args.copy)).toBeInTheDocument();
  },
};
