import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useMetadataEnrichStore } from '@/stores/useMetadataEnrichStore';
import { TooltipProvider } from '@/components/ui/tooltip';

import MetadataEnrichSection from './MetadataEnrichSection';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

function seed(library: Track[]): void {
  useLibraryStore.setState({ library });
  useMetadataEnrichStore.setState({
    isEnriching: false,
    isCancelling: false,
    skippedIds: new Set(),
    skippedLoaded: true,
    lastRunResults: [],
    progress: null,
  });
}

const meta: Meta<typeof MetadataEnrichSection> = {
  title: 'settings/MetadataEnrichSection',
  component: MetadataEnrichSection,
  decorators: [
    Story => (
      <TooltipProvider>
        <div className="max-w-[680px] p-4">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MetadataEnrichSection>;

export const Default: Story = {
  decorators: [
    Story => {
      seed([makeTrack(), makeTrack({ id: 'track-2', title: 'feels.mp3' })]);
      return <Story />;
    },
  ],
};

export const EmptyLibrary: Story = {
  decorators: [
    Story => {
      seed([]);
      return <Story />;
    },
  ],
};
