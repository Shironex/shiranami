import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Station } from 'radio-browser-api';

import StationRow from './StationRow';

function makeStation(overrides: Partial<Station> = {}): Station {
  return {
    changeId: '',
    id: 'station-1',
    name: 'Lofi Radio',
    url: 'http://stream.example.com',
    urlResolved: 'http://stream.example.com/resolved',
    homepage: 'http://example.com',
    favicon: '',
    tags: ['lofi', 'chillout'],
    country: 'United States',
    countryCode: 'US',
    state: '',
    language: ['english'],
    votes: 100,
    lastChangeTime: new Date(),
    codec: 'MP3',
    bitrate: 128,
    hls: false,
    lastCheckOk: true,
    lastCheckTime: new Date(),
    lastCheckOkTime: new Date(),
    lastLocalCheckTime: new Date(),
    clickTimestamp: new Date(),
    clickCount: 500,
    clickTrend: 10,
    ...overrides,
  } as Station;
}

const station = makeStation();

/**
 * radio · StationRow. One virtualized row in the radio directory: a favicon (or
 * decorative radio glyph), the station name + its first two tags, an optional
 * country flag + codec badge, a labelled favorite toggle ("Add to favorites" /
 * "Remove from favorites"), and a play affordance that becomes an animated EQ
 * indicator with an sr-only "Now Playing" while active. Resolves its station
 * from `stations[index]` and renders null past the end. Stories pass a one-item
 * list and toggle the favorite / playing flags via args.
 */
const meta: Meta<typeof StationRow> = {
  title: 'radio/StationRow',
  component: StationRow,
  parameters: {
    // The favorite button is aria-labelled, the active-state EQ carries an
    // sr-only "Now Playing" name, and the radio fallback glyph is presentational
    // — axe passes clean.
    a11y: { test: 'error' },
  },
  args: {
    index: 0,
    style: { position: 'relative', height: 56 },
    stations: [station],
    currentTrackId: null,
    isPlaying: false,
    favorites: [],
    onPlay: () => {},
    onToggleFavorite: () => {},
  },
  decorators: [
    Story => (
      <div className="w-[32rem] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof StationRow>;

/** Idle row — station name, tags, and an unfilled "Add to favorites" toggle. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Lofi Radio')).toBeInTheDocument();
    await expect(canvas.getByText('lofi, chillout')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Add to favorites' })).toBeInTheDocument();
  },
};

/** Favorited row — the toggle reads as the "remove" action. */
export const Favorited: Story = {
  args: {
    favorites: [station.id],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Remove from favorites' })).toBeInTheDocument();
  },
};

/** Active + playing — the EQ indicator exposes its sr-only "Now Playing" name. */
export const Playing: Story = {
  args: {
    currentTrackId: `radio:${station.id}`,
    isPlaying: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Now Playing')).toBeInTheDocument();
  },
};
