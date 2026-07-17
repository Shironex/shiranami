import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import { useLibraryStore } from '@/stores/useLibraryStore';
import CommandPalette from './CommandPalette';

// The palette reads recently-played history via react-query, so it needs a
// QueryClient in the tree (matching how it's mounted under the app provider).
function renderPalette() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommandPalette />
    </QueryClientProvider>
  );
}

// cmdk scrolls the active item into view on mount; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Lofi beats',
    artist: 'Lofi Collective',
    album: 'Late Nights',
    duration: 120,
    filePath: '/music/lofi.mp3',
    ...overrides,
  } as Track;
}

function seedLibrary(tracks: Track[]): void {
  useLibraryStore.setState({ library: tracks });
}

beforeEach(() => {
  seedLibrary([]);
});

afterEach(() => {
  seedLibrary([]);
});

describe('CommandPalette', () => {
  it('mounts closed — no search input is rendered until the shortcut fires', () => {
    renderPalette();

    // Closed: the dialog (and its input) are not mounted at all.
    expect(screen.queryByPlaceholderText(/play something/i)).toBeNull();
  });

  it('opens on Cmd/Ctrl+K and lists seeded library tracks', () => {
    seedLibrary([makeTrack({ id: 'a', title: 'Midnight study session' })]);
    renderPalette();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    // The palette dialog is now open with its search input and the track row.
    expect(screen.getByText('Midnight study session')).toBeInTheDocument();
  });
});
