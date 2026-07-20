import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/stores/types';
import type { ListeningHistoryEntry } from '@/types/electron';
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

let entrySeq = 0;

// A listening-history row pointing at `trackId`. The row rendered in the palette
// resolves to the *library* track, so the entry's own title/artist/album are
// placeholders and never surface in assertions.
function makeEntry(
  trackId: string,
  overrides: Partial<ListeningHistoryEntry> = {}
): ListeningHistoryEntry {
  entrySeq += 1;
  return {
    id: `history-${entrySeq}`,
    trackId,
    title: 'History title',
    artist: 'History artist',
    album: 'History album',
    albumArt: null,
    duration: 120,
    playedAt: '2026-01-01T00:00:00.000Z',
    playedSeconds: 120,
    completionRatio: 1,
    completed: true,
    source: 'library',
    ...overrides,
  };
}

function setRecent(entries: ListeningHistoryEntry[]): void {
  vi.mocked(window.electronAPI.db.history.getRecent).mockResolvedValue(entries);
}

function openPalette(): void {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
}

// The "Recently played" cmdk group element, awaited so the react-query fetch has
// resolved and the group has mounted. The heading only renders when at least one
// entry resolves to a live library track.
async function findRecentGroup(): Promise<HTMLElement> {
  const heading = await screen.findByText('Recently played');
  const group = heading.closest('[cmdk-group]');
  if (!group) throw new Error('Recently-played group container not found');
  return group as HTMLElement;
}

beforeEach(() => {
  seedLibrary([]);
});

afterEach(() => {
  seedLibrary([]);
  // Restore the default empty-history stub so recent-tracks state can't leak
  // between tests (vitest keeps mock implementations across tests by default).
  vi.mocked(window.electronAPI.db.history.getRecent).mockResolvedValue([]);
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

describe('CommandPalette · recently played', () => {
  it('surfaces recent entries resolved back to their live library tracks', async () => {
    seedLibrary([
      makeTrack({ id: 'a', title: 'Rainy afternoon' }),
      makeTrack({ id: 'b', title: 'Sunset drive' }),
    ]);
    setRecent([makeEntry('b')]);
    renderPalette();

    openPalette();

    const recentGroup = await findRecentGroup();
    expect(within(recentGroup).getAllByRole('option')).toHaveLength(1);
    expect(within(recentGroup).getByText('Sunset drive')).toBeInTheDocument();
  });

  it('collapses duplicate trackIds down to a single recent row', async () => {
    seedLibrary([makeTrack({ id: 'a', title: 'Rainy afternoon' })]);
    // Same track played three times in a row — should surface once.
    setRecent([makeEntry('a'), makeEntry('a'), makeEntry('a')]);
    renderPalette();

    openPalette();

    const recentGroup = await findRecentGroup();
    expect(within(recentGroup).getAllByRole('option')).toHaveLength(1);
  });

  it('caps recent rows at RECENT_LIMIT even when more entries resolve', async () => {
    // Mirrors RECENT_LIMIT (6) in CommandPalette.hooks.ts.
    const RECENT_LIMIT = 6;
    const tracks = Array.from({ length: RECENT_LIMIT + 3 }, (_, i) =>
      makeTrack({ id: `t${i}`, title: `Track ${i}` })
    );
    seedLibrary(tracks);
    setRecent(tracks.map(track => makeEntry(track.id)));
    renderPalette();

    openPalette();

    const recentGroup = await findRecentGroup();
    expect(within(recentGroup).getAllByRole('option')).toHaveLength(RECENT_LIMIT);
  });

  it('skips recent entries whose track is no longer in the library', async () => {
    seedLibrary([makeTrack({ id: 'a', title: 'Rainy afternoon' })]);
    // First entry points at a track that has since left the library; it must be
    // dropped, leaving only the still-present one.
    setRecent([makeEntry('ghost'), makeEntry('a')]);
    renderPalette();

    openPalette();

    const recentGroup = await findRecentGroup();
    expect(within(recentGroup).getAllByRole('option')).toHaveLength(1);
    expect(within(recentGroup).getByText('Rainy afternoon')).toBeInTheDocument();
  });
});
