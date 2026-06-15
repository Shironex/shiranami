import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMetadataEnrichStore, type EnrichLastRunEntry } from '@/stores/useMetadataEnrichStore';

import EnrichLastRunPanel from './EnrichLastRunPanel';

function seed(results: EnrichLastRunEntry[]): void {
  useMetadataEnrichStore.setState({ isEnriching: false, lastRunResults: results });
}

const SAMPLE: EnrichLastRunEntry[] = [
  {
    id: 'track-1',
    trackName: 'Modal Soul',
    source: 'itunes',
    confidence: 0.92,
    success: true,
    diffs: [
      { field: 'artist', oldValue: 'Unknown Artist', newValue: 'Nujabes' },
      { field: 'album', oldValue: null, newValue: 'Modal Soul' },
    ],
  },
  {
    id: 'track-2',
    trackName: 'feels.mp3',
    source: 'none',
    success: false,
    error: 'No metadata found',
    diffs: [],
  },
];

const meta: Meta<typeof EnrichLastRunPanel> = {
  title: 'settings/EnrichLastRunPanel',
  component: EnrichLastRunPanel,
  decorators: [
    Story => (
      <div className="max-w-[480px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    Story => {
      seed(SAMPLE);
      return <Story />;
    },
  ],
};
