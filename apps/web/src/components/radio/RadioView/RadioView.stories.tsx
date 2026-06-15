import type { Meta, StoryObj } from '@storybook/react-vite';
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

const meta: Meta<typeof RadioView> = {
  title: 'radio/RadioView',
  component: RadioView,
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

export const Default: Story = {
  decorators: [
    Story => {
      seedRadio({ stations });
      return <Story />;
    },
  ],
};

export const Loading: Story = {
  decorators: [
    Story => {
      seedRadio({ isLoading: true });
      return <Story />;
    },
  ],
};

export const Empty: Story = {
  decorators: [
    Story => {
      seedRadio({ stations: [] });
      return <Story />;
    },
  ],
};

export const Error: Story = {
  decorators: [
    Story => {
      seedRadio({ error: 'Could not reach the radio directory.' });
      return <Story />;
    },
  ],
};
