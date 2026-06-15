import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { folderKeys } from '@/hooks/queries/useFolders';
import type { WatchedFolder } from './MusicFoldersSection.types';

import MusicFoldersSection from './MusicFoldersSection';

const folders: WatchedFolder[] = [
  { id: 'f-1', path: '/Users/me/Music' },
  { id: 'f-2', path: '/Users/me/Downloads/Lofi' },
];

function seededClient(seed: WatchedFolder[]): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(folderKeys.all, seed);
  return client;
}

const meta: Meta<typeof MusicFoldersSection> = {
  title: 'settings/MusicFoldersSection',
  component: MusicFoldersSection,
  decorators: [
    Story => (
      <div className="max-w-[640px] p-4">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof MusicFoldersSection>;

export const Default: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient(folders)}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export const Empty: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient([])}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};
