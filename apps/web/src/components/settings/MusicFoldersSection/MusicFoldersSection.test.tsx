import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { folderKeys } from '@/hooks/queries/useFolders';
import { settingsKeys, type ElectronSettings } from '@/hooks/queries/useSettings';
import type { WatchedFolder } from './MusicFoldersSection.types';

import MusicFoldersSection from './MusicFoldersSection';

const folders: WatchedFolder[] = [
  { id: 'f-1', path: '/Users/me/Music' },
  { id: 'f-2', path: '/Users/me/Downloads/Lofi' },
];

function renderSection(
  ui: ReactElement,
  seed: WatchedFolder[],
  settings: ElectronSettings = {}
): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(folderKeys.all, seed);
  client.setQueryData(settingsKeys.all, settings);
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function reset(): void {
  useLibraryStore.setState({ scanState: 'idle' });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('MusicFoldersSection', () => {
  it('renders the watched folders', () => {
    renderSection(<MusicFoldersSection />, folders);

    expect(screen.getByRole('heading', { name: 'Music Folders' })).toBeInTheDocument();
    expect(screen.getByText('/Users/me/Music')).toBeInTheDocument();
    expect(screen.getByText('/Users/me/Downloads/Lofi')).toBeInTheDocument();
  });

  it('shows the empty state when no folders are added', () => {
    renderSection(<MusicFoldersSection />, []);

    expect(screen.getByText('No folders added yet')).toBeInTheDocument();
  });

  it('watches folders by default, with a switch to turn it off', async () => {
    renderSection(<MusicFoldersSection />, folders);

    const toggle = screen.getByRole('switch', { name: 'Watch folders for changes' });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    await waitFor(() =>
      expect(window.electronAPI.store.set).toHaveBeenCalledWith('settings', {
        watchFolders: false,
      })
    );
  });

  it('lets one folder opt out of watching', async () => {
    renderSection(<MusicFoldersSection />, folders, { watchFoldersExcluded: ['f-2'] });

    const toggles = screen.getAllByRole('button', { name: 'Watch this folder for changes' });
    expect(toggles.map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

    await userEvent.click(toggles[0]);

    await waitFor(() =>
      expect(window.electronAPI.store.set).toHaveBeenCalledWith('settings', {
        watchFoldersExcluded: ['f-2', 'f-1'],
      })
    );
  });

  it('two quick opt-outs both survive', async () => {
    // The first write is still in flight when the second click lands, and the
    // second waits for it rather than racing it to disk.
    const releases: Array<() => void> = [];
    const held = () => new Promise<void>(resolve => releases.push(resolve));
    vi.mocked(window.electronAPI.store.set)
      .mockImplementationOnce(held)
      .mockImplementationOnce(held);
    renderSection(<MusicFoldersSection />, folders);

    const toggles = screen.getAllByRole('button', { name: 'Watch this folder for changes' });
    await userEvent.click(toggles[0]);
    await userEvent.click(toggles[1]);

    await waitFor(() => expect(releases).toHaveLength(1));
    releases[0]();
    await waitFor(() => expect(releases).toHaveLength(2));
    expect(window.electronAPI.store.set).toHaveBeenLastCalledWith('settings', {
      watchFoldersExcluded: ['f-1', 'f-2'],
    });
    releases[1]();
  });

  it('hides the per-folder controls while watching is off', () => {
    renderSection(<MusicFoldersSection />, folders, { watchFolders: false });

    expect(screen.getByRole('switch', { name: 'Watch folders for changes' })).not.toBeChecked();
    expect(
      screen.queryByRole('button', { name: 'Watch this folder for changes' })
    ).not.toBeInTheDocument();
  });
});
