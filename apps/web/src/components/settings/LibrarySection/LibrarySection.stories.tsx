import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { folderKeys } from '@/hooks/queries/useFolders';

import LibrarySection from './LibrarySection';

function makeTrack(id: string): Track {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Lofi Artist',
    album: 'Chill Album',
    duration: 200,
    filePath: `/music/${id}.mp3`,
    isFavorite: false,
  };
}

function client(): QueryClient {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  c.setQueryData(folderKeys.all, []);
  return c;
}

const meta: Meta<typeof LibrarySection> = {
  title: 'settings/LibrarySection',
  component: LibrarySection,
  decorators: [
    Story => (
      <QueryClientProvider client={client()}>
        <div className="max-w-[640px] p-4 space-y-4">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LibrarySection>;

export const Default: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({
        library: [makeTrack('1'), makeTrack('2'), makeTrack('3')],
        scanState: 'idle',
      });
      return <Story />;
    },
  ],
};

export const Empty: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({ library: [], scanState: 'idle' });
      return <Story />;
    },
  ],
};
