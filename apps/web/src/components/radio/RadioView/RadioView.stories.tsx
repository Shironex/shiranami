import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import type { Station } from 'radio-browser-api';
import { useRadioStore } from '@/stores/useRadioStore';

import RadioView from './RadioView';

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

const stations: Station[] = [
  makeStation({ id: 's1', name: 'Chillhop Radio', tags: ['lofi', 'hiphop'] }),
  makeStation({ id: 's2', name: 'Jazz Cafe', tags: ['jazz', 'lounge'], countryCode: 'FR' }),
  makeStation({ id: 's3', name: 'Synthwave FM', tags: ['synthwave'], countryCode: 'GB' }),
];

/** Seed the radio store the view reads from. */
function seedRadio(state: Partial<Parameters<typeof useRadioStore.setState>[0]>): void {
  useRadioStore.setState({
    stations: [],
    favorites: [],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    filters: {},
    mode: 'browse',
    hasMore: false,
    ...state,
  });
}

/**
 * radio · RadioView. The Radio screen: a "Radio" page header, a labelled search
 * box, browse/favorites mode tabs, country/language/tag `FilterPopover`s, genre
 * pills, active-filter chips, and a virtualized list of `StationRow`s — with
 * loading skeletons, an empty state, and an error+retry card. Reads
 * `useRadioStore`; on mount it kicks off a top-stations fetch, so the result
 * region is non-deterministic under the headless browser run — `play` asserts
 * the stable page chrome (header + search), while the seeded states drive the
 * visual variants for docs.
 */
const meta: Meta<typeof RadioView> = {
  title: 'radio/RadioView',
  component: RadioView,
  parameters: {
    // The page title is a real <h1>, the search input is aria-labelled, mode
    // tabs / pills are real buttons, and the mascot art is aria-hidden — the
    // persistent chrome axe sees is clean.
    a11y: { test: 'error' },
  },
  decorators: [
    Story => (
      <div className="flex h-[40rem] flex-col">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RadioView>;

/** Seeded with stations — the page chrome (header + search) renders. */
export const Default: Story = {
  beforeEach: () => {
    seedRadio({ stations });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Radio' })).toBeInTheDocument();
    await expect(
      canvas.getByRole('textbox', { name: 'Search radio stations...' })
    ).toBeInTheDocument();
  },
};

/** Loading — skeleton rows fill the result region while a fetch is in flight. */
export const Loading: Story = {
  beforeEach: () => {
    seedRadio({ isLoading: true });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Radio' })).toBeInTheDocument();
  },
};

/** Empty — no stations and no active filters fall back to the empty state. */
export const Empty: Story = {
  beforeEach: () => {
    seedRadio({ stations: [] });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Radio' })).toBeInTheDocument();
  },
};

/** Error — the directory failed to load, offering a retry. */
export const Error: Story = {
  beforeEach: () => {
    seedRadio({ error: 'Could not reach the radio directory.' });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Radio' })).toBeInTheDocument();
  },
};
