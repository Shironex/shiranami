import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof StationRow> = {
  title: 'radio/StationRow',
  component: StationRow,
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

export const Default: Story = {};

export const Favorited: Story = {
  args: {
    favorites: [station.id],
  },
};

export const Playing: Story = {
  args: {
    currentTrackId: `radio:${station.id}`,
    isPlaying: true,
  },
};
