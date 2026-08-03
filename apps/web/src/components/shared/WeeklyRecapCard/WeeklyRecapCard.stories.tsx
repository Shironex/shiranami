import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { WeeklyRecap } from '@/hooks/queries/useRecap';

import WeeklyRecapCard from './WeeklyRecapCard';

const recap: WeeklyRecap = {
  weekKey: '2026-07-27',
  totalPlays: 42,
  totalMinutes: 400,
  sessionCount: 11,
  topTrack: { title: 'Kiro', playCount: 9 },
  loudestHour: 23,
};

/**
 * shared · WeeklyRecapCard. "This week, quietly": a few prose lines about a
 * finished week — hours across sittings, the most-returned track, the loudest
 * hour. Numbers become sentences, never badges, and untrue lines simply don't
 * render. A real `<h2>` heads the card; the only interactive surface is the
 * optional "Past weeks" header action that opens the History archive (absent
 * inside the archive itself, where a week-range eyebrow appears instead).
 */
const meta: Meta<typeof WeeklyRecapCard> = {
  title: 'shared/WeeklyRecapCard',
  component: WeeklyRecapCard,
  parameters: {
    // Real heading, prose paragraphs, one labelled text button — axe passes.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[34rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof WeeklyRecapCard>;

/** The Overview appearance — full prose plus the archive action. */
export const Default: Story = {
  args: { recap, onOpenArchive: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: /The week, in short\./ })).toBeInTheDocument();
    await expect(canvas.getByText(/across 11 sittings/)).toBeInTheDocument();
    await expect(canvas.getByText(/Kiro — 9 times/)).toBeInTheDocument();
    await expect(canvas.getByText('Loudest at 23:00.')).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: /Past weeks/ }));
    await expect(args.onOpenArchive).toHaveBeenCalledTimes(1);
  },
};

/** Archive context — week-range eyebrow, no action; sparse weeks lose lines. */
export const ArchivedSparseWeek: Story = {
  args: {
    recap: {
      ...recap,
      totalPlays: 4,
      totalMinutes: 35,
      sessionCount: 1,
      topTrack: null,
      loudestHour: null,
    },
    weekLabel: '27 Jul – 2 Aug',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('27 Jul – 2 Aug')).toBeInTheDocument();
    await expect(canvas.getByText(/in a single sitting/)).toBeInTheDocument();
    // Untrue lines don't render — no track to return to, no clear peak.
    await expect(canvas.queryByText(/coming back/)).not.toBeInTheDocument();
    await expect(canvas.queryByText(/Loudest at/)).not.toBeInTheDocument();
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument();
  },
};
