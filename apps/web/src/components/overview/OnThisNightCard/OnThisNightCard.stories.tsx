import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, userEvent, expect, fn } from 'storybook/test';
import type { OnThisNightMemory } from '@/hooks/queries/useMemories';

import OnThisNightCard from './OnThisNightCard';

const memory: OnThisNightMemory = {
  distance: 'year',
  anchorIso: '2025-08-14T12:00:00.000Z',
  track: {
    trackId: 'trk-1',
    title: 'Kiro',
    artist: 'Shironami',
    album: 'Night Drift',
    albumArt: null,
    playCount: 4,
    listenedSeconds: 900,
    lastPlayedAt: '2025-08-14T23:00:00.000Z',
  },
  totalPlays: 6,
};

/**
 * overview · OnThisNightCard. "A year ago, tonight": one remembered track from
 * the anniversary window, in the weekly recap's prose voice — a real `<h2>`
 * heading, a mono date eyebrow, one soft line, and a single labelled play row
 * whose cover doubles as the affordance. Falls back to a six-month voice when
 * the year-old window was silent; renders nothing at all (upstream) when both
 * windows are.
 */
const meta: Meta<typeof OnThisNightCard> = {
  title: 'overview/OnThisNightCard',
  component: OnThisNightCard,
  // A real heading, prose paragraphs, and one aria-labelled button — axe clean.
  parameters: { a11y: { test: 'error' } },
  decorators: [
    Story => (
      <div className="w-[34rem]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof OnThisNightCard>;

/** The year-old memory — full prose plus the play row. */
export const Default: Story = {
  args: { memory, onPlay: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: /A year ago, tonight\./ })
    ).toBeInTheDocument();
    await expect(
      canvas.getByText('This one kept the night company — 4 plays.')
    ).toBeInTheDocument();
    await expect(canvas.getByText('Shironami · Night Drift')).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Play Kiro by Shironami' }));
    await expect(args.onPlay).toHaveBeenCalledWith('trk-1');
  },
};

/** The six-month fallback for quiet years — one play, the softest line. */
export const HalfYearSinglePlay: Story = {
  args: {
    memory: {
      ...memory,
      distance: 'halfYear',
      anchorIso: '2026-02-14T12:00:00.000Z',
      track: { ...memory.track, playCount: 1 },
    },
    onPlay: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: /Six months ago, tonight\./ })
    ).toBeInTheDocument();
    await expect(canvas.getByText('This one drifted through that evening.')).toBeInTheDocument();
    await expect(canvas.queryByText(/kept the night company/)).not.toBeInTheDocument();
  },
};
