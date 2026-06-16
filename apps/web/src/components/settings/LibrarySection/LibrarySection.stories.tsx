import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { within, expect } from 'storybook/test';
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

/**
 * Each story owns a QueryClient seeded with an empty folder list so the embedded
 * DiskUsageSection settles on its "no folders" empty state instead of an IPC
 * loading spinner.
 */
function client(): QueryClient {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  c.setQueryData(folderKeys.all, []);
  return c;
}

/**
 * settings · LibrarySection. The Library panel: a track-count card with a Rescan
 * button, and — under Electron — an embedded DiskUsageSection plus a Backup &
 * Restore card. A destructive "Danger Zone" card appears only when the library
 * has tracks. The track list lives in `useLibraryStore`.
 *
 * The DiskUsageSection + Backup card are gated on `isElectron` (= the
 * `IS_ELECTRON` module-constant from `@/lib/platform`). In the Storybook browser
 * run that constant resolves to `false` — platform.ts is imported before the
 * preview installs the electronAPI mock — so those two cards are unreachable
 * here. The stories assert the always-present Library card and the
 * library-gated Danger Zone, which exercise the store-driven behavior.
 */
const meta: Meta<typeof LibrarySection> = {
  title: 'settings/LibrarySection',
  component: LibrarySection,
  // Card titles are real headings, every action is a named button, and the
  // disk-usage empty state is plain text — axe clean.
  parameters: { a11y: { test: 'error' } },
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

/** With tracks — the count, the Rescan action, and the Danger Zone all render. */
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    await expect(canvas.getByText('Total tracks')).toBeInTheDocument();
    await expect(canvas.getByText('3')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Rescan Library' })).toBeInTheDocument();

    // Danger zone is present because the library has tracks.
    await expect(canvas.getByRole('button', { name: 'Clear Library' })).toBeInTheDocument();

    // The Backup & Restore card is Electron-gated (IS_ELECTRON is a false
    // module-constant in the Storybook browser run, see meta), so it is absent.
    await expect(
      canvas.queryByRole('heading', { name: 'Backup & Restore' })
    ).not.toBeInTheDocument();
  },
};

/** Empty — no tracks means the Danger Zone is hidden. */
export const Empty: Story = {
  decorators: [
    Story => {
      useLibraryStore.setState({ library: [], scanState: 'idle' });
      return <Story />;
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: 'Clear Library' })).not.toBeInTheDocument();
  },
};
