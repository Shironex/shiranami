import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { folderKeys } from '@/hooks/queries/useFolders';
import type { WatchedFolder } from './MusicFoldersSection.types';

import MusicFoldersSection from './MusicFoldersSection';

const folders: WatchedFolder[] = [
  { id: 'f-1', path: '/Users/me/Music' },
  { id: 'f-2', path: '/Users/me/Downloads/Lofi' },
];

function renderSection(ui: ReactElement, seed: WatchedFolder[]): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(folderKeys.all, seed);
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
});
