import type { Meta, StoryObj } from '@storybook/react-vite';
import { Clock, EyeOff, TrendingUp } from 'lucide-react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Track } from '@/stores/types';
import type { IMixGridCard } from '../MixesView.types';

import MixGridRow from './MixGridRow';

/** A 1x1 transparent PNG so stories render artwork without bundling assets. */
const ART =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats to relax and study to',
    artist: 'Chillhop',
    album: 'Essentials',
    duration: 215,
    filePath: '/music/lofi.mp3',
    albumArt: ART,
    ...overrides,
  };
}

function makePreviews(count: number): Track[] {
  return Array.from({ length: count }).map((_, i) => makeTrack({ id: `track-${i}` }));
}

function makeCard(overrides: Partial<IMixGridCard> = {}): IMixGridCard {
  return {
    id: 'most-played',
    icon: TrendingUp,
    title: 'Most Played',
    desc: 'The tracks you keep coming back to',
    count: 24,
    previewTracks: makePreviews(4),
    onOpen: fn(),
    ...overrides,
  };
}

/**
 * mixes · MixGridRow. One curated mix in the mixes overview grid: a leading
 * artwork tile, the mix title + description, and a trailing track count with a
 * hover-revealed play affordance. The whole row is a single `<button>` that
 * opens the mix detail view. The tile has three real treatments — a 2x2 mosaic
 * (4+ preview tracks), a single cover (1–3), and the mix's own icon (none) —
 * one story each. All artwork is decorative (`aria-hidden`, empty `alt`), so the
 * button's accessible name is its text alone.
 */
const meta: Meta<typeof MixGridRow> = {
  title: 'mixes/MixGridRow',
  component: MixGridRow,
  parameters: {
    // One labelled <button> per row; every cover is aria-hidden with an empty
    // alt, so axe finds nothing unnamed — passes clean.
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

type Story = StoryObj<typeof MixGridRow>;

/** Four preview covers — the 2x2 mosaic. Clicking the row opens the mix. */
export const Mosaic: Story = {
  args: {
    card: makeCard(),
    countLabel: '24 tracks',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole('button', {
      name: 'Most Played The tracks you keep coming back to 24 tracks',
    });

    // Four decorative tiles, none of them exposed to assistive tech.
    await expect(canvasElement.querySelectorAll('img')).toHaveLength(4);
    await expect(canvas.queryByRole('img')).not.toBeInTheDocument();

    await userEvent.click(row);
    await expect(args.card.onOpen).toHaveBeenCalledTimes(1);
  },
};

/** Below the mosaic threshold — a single cover fills the tile. */
export const SingleCover: Story = {
  args: {
    card: makeCard({
      id: 'recently-added',
      icon: Clock,
      title: 'Recently Added',
      desc: 'Fresh from your last import',
      count: 3,
      previewTracks: makePreviews(2),
    }),
    countLabel: '3 tracks',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('img')).toHaveLength(1);
    await expect(canvasElement.querySelector('.grid-cols-2')).toBeNull();
  },
};

/** No artwork at all — the mix's own icon stands in for the covers. */
export const IconFallback: Story = {
  args: {
    card: makeCard({
      id: 'never-played',
      icon: EyeOff,
      title: 'Never Played',
      desc: 'Tracks still waiting for a first listen',
      count: 7,
      previewTracks: [],
    }),
    countLabel: '7 tracks',
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('img')).toHaveLength(0);
    await expect(canvasElement.querySelector('svg.lucide-eye-off')).not.toBeNull();
  },
};

/** An empty mix — the trailing count is dropped rather than showing zero. */
export const EmptyMix: Story = {
  args: {
    card: makeCard({
      id: 'recently-played',
      title: 'Recently Played',
      desc: 'Nothing here yet this session',
      count: 0,
      previewTracks: [],
    }),
    countLabel: '0 tracks',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('0 tracks')).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Recently Played Nothing here yet this session' })
    ).toBeInTheDocument();
  },
};
