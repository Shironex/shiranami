import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';

import StatTile from './StatTile';

/**
 * overview · StatTile. One Overview stat tile: a faint decorative kanji
 * watermark, an emphasized value, a two-line uppercase label, and an optional
 * trend hint tinted by direction (`up` reads green, others muted). The watermark
 * is `aria-hidden`, so the only readable content is the value, label, and hint.
 * Stories assert the value + label text and that the hint shows only when given.
 */
const meta: Meta<typeof StatTile> = {
  title: 'overview/StatTile',
  component: StatTile,
  parameters: {
    // The kanji watermark is aria-hidden; value/label/hint are plain text with
    // sufficient contrast on the glass surface — axe passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StatTile>;

/** Value + label only — no trend hint line. */
export const Default: Story = {
  args: {
    kanji: '時',
    value: '14h 32m',
    label: 'Listened this week',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('14h 32m')).toBeInTheDocument();
    await expect(canvas.getByText('Listened this week')).toBeInTheDocument();
    // No hint was supplied, so the trend sub-line is absent.
    await expect(canvas.queryByText(/vs\. last week/)).not.toBeInTheDocument();
  },
};

/** Upward trend — the hint renders and is tinted positive (green). */
export const TrendUp: Story = {
  args: {
    kanji: '時',
    value: '14h 32m',
    label: 'Listened this week',
    hint: '+2h 18m vs. last week',
    trend: 'up',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const hint = canvas.getByText('+2h 18m vs. last week');
    await expect(hint).toBeInTheDocument();
    await expect(hint).toHaveClass('text-success/90');
  },
};

/** Downward trend — the hint renders but stays muted (not the positive tint). */
export const TrendDown: Story = {
  args: {
    kanji: '時',
    value: '9h 02m',
    label: 'Listened this week',
    hint: '−45m vs. last week',
    trend: 'down',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const hint = canvas.getByText('−45m vs. last week');
    await expect(hint).toBeInTheDocument();
    await expect(hint).not.toHaveClass('text-success/90');
  },
};
