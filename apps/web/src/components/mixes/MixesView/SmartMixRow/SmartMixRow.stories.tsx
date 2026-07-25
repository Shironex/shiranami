import type { Meta, StoryObj } from '@storybook/react-vite';
import { Brain, CalendarClock, CloudRain } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ISmartMixCard } from '../MixesView.types';

import SmartMixRow from './SmartMixRow';

function makeCard(overrides: Partial<ISmartMixCard> = {}): ISmartMixCard {
  return {
    id: 'focus',
    icon: Brain,
    title: 'Deep focus',
    desc: 'Steady instrumentals for a long stretch of work',
    count: 18,
    onPlay: fn(),
    ...overrides,
  };
}

/**
 * mixes · SmartMixRow. One entry in the "For you right now" section of the mixes
 * overview — a kind icon, the generated title + description, and a track count
 * with a hover-revealed play affordance. The row is a single `<button>` that
 * plays the mix immediately (there is no detail view for smart mixes). Stories
 * cover the mix kinds that change the icon and copy shape, plus the truncation
 * behaviour on long generated titles.
 */
const meta: Meta<typeof SmartMixRow> = {
  title: 'mixes/SmartMixRow',
  component: SmartMixRow,
  parameters: {
    // The row is one labelled <button> and the icon is a decorative SVG — axe
    // passes clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="w-[30rem] rounded-2xl glass-panel border border-border/30 p-2">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof SmartMixRow>;

/** The focus mix — clicking the row starts playback straight away. */
export const Default: Story = {
  args: {
    card: makeCard(),
    countLabel: '18 tracks',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole('button', {
      name: 'Deep focus Steady instrumentals for a long stretch of work 18 tracks',
    });

    await userEvent.click(row);
    await expect(args.card.onPlay).toHaveBeenCalledTimes(1);
  },
};

/** A weather-driven mix — a different kind swaps the leading icon. */
export const RainyDay: Story = {
  args: {
    card: makeCard({
      id: 'rainy-day',
      icon: CloudRain,
      title: 'Rainy day',
      desc: 'Softer tracks for the weather outside',
      count: 9,
    }),
    countLabel: '9 tracks',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('svg.lucide-cloud-rain')).not.toBeNull();
  },
};

/** Decade mixes carry the longest generated copy — both lines truncate. */
export const LongCopy: Story = {
  args: {
    card: makeCard({
      id: 'decade',
      icon: CalendarClock,
      title: 'The 1990s, revisited from your own library',
      desc: 'Everything you have tagged between 1990 and 1999, shuffled into one long sitting',
      count: 132,
    }),
    countLabel: '132 tracks',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Truncation is visual only — the full strings stay in the a11y tree.
    await expect(canvas.getByText('The 1990s, revisited from your own library')).toHaveClass(
      'truncate'
    );
    await expect(canvas.getByText('132 tracks')).toBeInTheDocument();
  },
};
