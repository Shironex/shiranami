import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function renderSection(ui: ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(folderKeys.all, []);
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function reset(): void {
  useLibraryStore.setState({ library: [], scanState: 'idle' });
  vi.clearAllMocks();
}

beforeEach(reset);
afterEach(reset);

describe('LibrarySection', () => {
  it('renders the library card with the track count', () => {
    useLibraryStore.setState({ library: [makeTrack('1'), makeTrack('2')] });
    renderSection(<LibrarySection />);

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByText('Total tracks')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('hides the danger zone when the library is empty', () => {
    renderSection(<LibrarySection />);

    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });
});
