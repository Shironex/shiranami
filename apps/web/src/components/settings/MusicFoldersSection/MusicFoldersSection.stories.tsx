import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import { folderKeys } from '@/hooks/queries/useFolders';
import type { WatchedFolder } from './MusicFoldersSection.types';

import MusicFoldersSection from './MusicFoldersSection';

const folders: WatchedFolder[] = [
  { id: 'f-1', path: '/Users/me/Music' },
  { id: 'f-2', path: '/Users/me/Downloads/Lofi' },
];

/**
 * Seed a client whose folders query is pre-populated and never refetches, so the
 * IPC-backed `useFoldersQuery` resolves to the seed instead of the Storybook
 * electron mock's no-op (which would otherwise clobber it back to empty).
 */
function seededClient(seed: WatchedFolder[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(folderKeys.all, seed);
  return client;
}

/**
 * settings · MusicFoldersSection. The "Music Folders" panel: the list of watched
 * library directories (each with a hover Remove button), an Add Folder button,
 * and the subfolder-playlist dialog it can open. Folder data comes from the
 * IPC-backed `useFoldersQuery`; in the browser run there is no real DB, so stories
 * seed the react-query cache directly. Add/remove are IPC no-ops here.
 */
const meta: Meta<typeof MusicFoldersSection> = {
  title: 'settings/MusicFoldersSection',
  component: MusicFoldersSection,
  parameters: {
    // Card title is a real heading, the Add button is a real button, and each
    // remove control is an icon-button with an aria-label — axe clean.
    a11y: { test: 'error' },
  },
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

/** Two watched folders — paths listed, each with a Remove control. */
export const Default: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient(folders)}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Music Folders' })).toBeInTheDocument();
    // Both seeded folder paths render.
    await expect(await canvas.findByText('/Users/me/Music')).toBeInTheDocument();
    await expect(canvas.getByText('/Users/me/Downloads/Lofi')).toBeInTheDocument();
    // Each folder row exposes a labelled remove control.
    await expect(canvas.getAllByRole('button', { name: 'Remove folder' })).toHaveLength(2);
    // The add-folder action is present.
    await expect(canvas.getByRole('button', { name: /Add Folder/ })).toBeInTheDocument();
  },
};

/** No folders — the empty state replaces the list, Add still available. */
export const Empty: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient([])}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('No folders added yet')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Remove folder' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: /Add Folder/ })).toBeInTheDocument();
  },
};
