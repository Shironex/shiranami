import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { Clock3, Disc3, Music4, Users } from 'lucide-react';

import HistoryStatCard from './HistoryStatCard';

/**
 * history · HistoryStatCard. One tile in the history dashboard's summary strip:
 * an uppercase label with a contextual icon opposite it, the headline figure
 * beneath, and a supporting hint line. Purely presentational — HistoryView's
 * hook localizes and formats every string before it arrives — and
 * non-interactive, so the stories cover the shapes the dashboard actually feeds
 * it: a plays count, a duration, an artist count, and the all-zero state a fresh
 * install shows.
 */
const meta: Meta<typeof HistoryStatCard> = {
  title: 'history/HistoryStatCard',
  component: HistoryStatCard,
  // a11y is left at the global 'todo' default (not ratcheted to 'error'): the
  // label and hint lines use sub-opacity muted tokens (`text-muted-foreground/
  // 55` and `/65`) over the card's translucent `glass-subtle` surface, so axe's
  // color-contrast ratio is non-deterministic against the layered backdrop. The
  // visible label/value/hint are asserted in `play`.
  args: {
    label: 'Total plays',
    value: '1,204',
    hint: 'Across 88 tracks',
    icon: Music4,
  },
  decorators: [
    Story => (
      <div className="w-[18rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof HistoryStatCard>;

/** The plays tile — label, formatted figure, and supporting hint. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Total plays')).toBeInTheDocument();
    await expect(canvas.getByText('1,204')).toBeInTheDocument();
    await expect(canvas.getByText('Across 88 tracks')).toBeInTheDocument();
  },
};

/** A duration figure — the card renders whatever the hook already formatted. */
export const ListeningTime: Story = {
  args: {
    label: 'Listening time',
    value: '9h 20m',
    hint: 'This week',
    icon: Clock3,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('9h 20m')).toBeInTheDocument();
    await expect(canvas.getByText('This week')).toBeInTheDocument();
  },
};

/** A count tile with a different icon — the icon is a prop, not a constant. */
export const UniqueArtists: Story = {
  args: {
    label: 'Unique artists',
    value: '42',
    hint: 'Since you started',
    icon: Users,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Unique artists')).toBeInTheDocument();
    await expect(canvasElement.querySelector('svg')?.getAttribute('class')).toMatch(/lucide-users/);
  },
};

/** A fresh install — zero renders verbatim, the tile keeps its full height. */
export const ZeroState: Story = {
  args: {
    label: 'Unique albums',
    value: '0',
    hint: 'Play something to start',
    icon: Disc3,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('0')).toBeInTheDocument();
    await expect(canvas.getByText('Play something to start')).toBeInTheDocument();
  },
};
