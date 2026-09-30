import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
import { folderKeys } from '@/hooks/queries/useFolders';
import { settingsKeys, type ElectronSettings } from '@/hooks/queries/useSettings';
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
function seededClient(seed: WatchedFolder[], settings: ElectronSettings = {}): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(folderKeys.all, seed);
  client.setQueryData(settingsKeys.all, settings);
  return client;
}

/**
 * settings · MusicFoldersSection. The "Music Folders" panel: the list of watched
 * library directories (each with a hover Remove button and a watch toggle), an
 * Add Folder button, the "Watch folders for changes" switch, and the
 * subfolder-playlist dialog it can open. Folder data comes from the
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
    // Watching is on by default, and every folder is watched.
    await expect(canvas.getByRole('switch', { name: 'Watch folders for changes' })).toBeChecked();
    for (const toggle of canvas.getAllByRole('button', { name: 'Watch this folder for changes' })) {
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    }
  },
};

/** One folder opted out of watching: its toggle stays visible, unpressed. */
export const FolderNotWatched: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient(folders, { watchFoldersExcluded: ['f-2'] })}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('/Users/me/Downloads/Lofi')).toBeInTheDocument();
    const toggles = canvas.getAllByRole('button', { name: 'Watch this folder for changes' });
    await expect(toggles[0]).toHaveAttribute('aria-pressed', 'true');
    await expect(toggles[1]).toHaveAttribute('aria-pressed', 'false');
  },
};

/** Watching turned off: the switch is off and the per-folder toggles are gone. */
export const WatchingOff: Story = {
  decorators: [
    Story => (
      <QueryClientProvider client={seededClient(folders, { watchFolders: false })}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('/Users/me/Music')).toBeInTheDocument();
    await expect(
      canvas.getByRole('switch', { name: 'Watch folders for changes' })
    ).not.toBeChecked();
    await expect(
      canvas.queryByRole('button', { name: 'Watch this folder for changes' })
    ).not.toBeInTheDocument();
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
