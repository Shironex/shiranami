import type { ReactElement } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SmartPlaylist } from '@shiranami/contracts';
import type { Track } from '@/stores/types';
import { useViewStore } from '@/stores/useViewStore';
import { smartPlaylistKeys } from '@/hooks/queries/useSmartPlaylists';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';
import SmartPlaylistDetail from './SmartPlaylistDetail';

const PLAYLIST_ID = 'sp-1';

function smartPlaylistsApi() {
  return window.electronAPI.db.smartPlaylists;
}

function makePlaylist(overrides: Partial<SmartPlaylist> = {}): SmartPlaylist {
  return {
    id: PLAYLIST_ID,
    name: 'Late-night focus',
    description: null,
    matchType: 'all',
    rules: [{ field: 'genre', operator: 'is', value: 'lofi' }],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    title: 'Midnight study session',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
    isFavorite: false,
    ...overrides,
  };
}

interface ISeed {
  /** Seeded detail-query value; omit to leave the query unresolved. */
  readonly playlist?: SmartPlaylist | null;
  /** Seeded tracks-query value; omit to leave the query unresolved. */
  readonly tracks?: Track[];
}

function renderDetail(seed: ISeed = {}): ReturnType<typeof render> {
  // staleTime keeps the seeded cache authoritative: the jsdom electronAPI mock
  // is not the real bridge, so a background refetch would only add noise.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  if (seed.playlist !== undefined) {
    client.setQueryData(smartPlaylistKeys.detail(PLAYLIST_ID), seed.playlist);
  }
  if (seed.tracks !== undefined) {
    client.setQueryData(smartPlaylistKeys.tracks(PLAYLIST_ID), seed.tracks);
  }
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <SmartPlaylistDetail id={PLAYLIST_ID} />
    </QueryClientProvider>
  );
  return render(ui);
}

/** The confirm popover, scoped so its "Delete" button never collides with the header's. */
function deletePopover(): HTMLElement {
  const prompt = screen.getByText('Delete this smart playlist?');
  const popover = prompt.parentElement;
  if (!popover) throw new Error('delete confirmation popover has no container');
  return popover;
}

async function openDeleteConfirm(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await screen.findByText('Delete this smart playlist?');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(smartPlaylistsApi(), 'get').mockResolvedValue(null);
  vi.spyOn(smartPlaylistsApi(), 'getTracks').mockResolvedValue([]);
  vi.spyOn(smartPlaylistsApi(), 'delete').mockResolvedValue(undefined);
  useViewStore.getState().selectSmartPlaylist(PLAYLIST_ID);
});

afterEach(() => {
  useViewStore.getState().selectSmartPlaylist(null);
});

describe('SmartPlaylistDetail', () => {
  it('holds a spinner while the playlist metadata query is in flight', () => {
    vi.spyOn(smartPlaylistsApi(), 'get').mockReturnValue(new Promise(() => {}));
    const { container } = renderDetail();

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders the not-found state when the playlist does not exist', () => {
    renderDetail({ playlist: null, tracks: [] });

    expect(screen.getByText('Smart playlist not found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });

  it('clears the selection when going back from the not-found state', async () => {
    renderDetail({ playlist: null, tracks: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Go back' }));

    expect(useViewStore.getState().selectedSmartPlaylistId).toBeNull();
  });

  it('renders the playlist name and the pluralized match count', () => {
    renderDetail({
      playlist: makePlaylist(),
      tracks: [makeTrack({ id: 'a' }), makeTrack({ id: 'b', title: 'Rainy day cafe' })],
    });

    expect(screen.getByRole('heading', { name: 'Late-night focus' })).toBeInTheDocument();
    expect(screen.getByText('2 matching tracks')).toBeInTheDocument();
  });

  it('renders the singular match count for a single matching track', () => {
    renderDetail({ playlist: makePlaylist(), tracks: [makeTrack()] });

    expect(screen.getByText('1 matching track')).toBeInTheDocument();
  });

  it('mounts the virtualized track list when tracks match', () => {
    const { container } = renderDetail({ playlist: makePlaylist(), tracks: [makeTrack()] });

    // The react-window list mounts inside the glass panel; rows themselves have
    // no measured height in jsdom, so the panel is the observable seam.
    expect(container.querySelector('.glass-panel')).not.toBeNull();
  });

  it('renders the empty state instead of the list when no track matches', () => {
    const { container } = renderDetail({ playlist: makePlaylist(), tracks: [] });

    expect(screen.getByText('No smart playlists yet')).toBeInTheDocument();
    expect(container.querySelector('.glass-panel')).toBeNull();
  });

  it('keeps the header while the matching-tracks query is still loading', () => {
    vi.spyOn(smartPlaylistsApi(), 'getTracks').mockReturnValue(new Promise(() => {}));
    const { container } = renderDetail({ playlist: makePlaylist() });

    expect(screen.getByRole('heading', { name: 'Late-night focus' })).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('No smart playlists yet')).toBeNull();
  });

  it('opens the edit dialog seeded with the playlist from the header action', async () => {
    renderDetail({ playlist: makePlaylist(), tracks: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Edit Smart Playlist' })
    ).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Late-night focus')).toBeInTheDocument();
  });

  it('opens the delete confirmation from the header delete action', async () => {
    renderDetail({ playlist: makePlaylist(), tracks: [] });

    expect(screen.queryByText('Delete this smart playlist?')).toBeNull();
    await openDeleteConfirm();

    const popover = within(deletePopover());
    expect(popover.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(popover.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('dismisses the confirmation without deleting when cancelled', async () => {
    renderDetail({ playlist: makePlaylist(), tracks: [] });
    await openDeleteConfirm();

    await userEvent.click(within(deletePopover()).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText('Delete this smart playlist?')).toBeNull();
    });
    expect(smartPlaylistsApi().delete).not.toHaveBeenCalled();
    expect(useViewStore.getState().selectedSmartPlaylistId).toBe(PLAYLIST_ID);
  });

  it('deletes the playlist and returns to the grid on confirmation', async () => {
    renderDetail({ playlist: makePlaylist(), tracks: [] });
    await openDeleteConfirm();

    await userEvent.click(within(deletePopover()).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(smartPlaylistsApi().delete).toHaveBeenCalledWith(PLAYLIST_ID);
    });
    await waitFor(() => {
      expect(useViewStore.getState().selectedSmartPlaylistId).toBeNull();
    });
  });

  it('keeps the confirmation open and toasts when the delete fails', async () => {
    vi.spyOn(smartPlaylistsApi(), 'delete').mockRejectedValue(new Error('ipc down'));
    renderDetail({ playlist: makePlaylist(), tracks: [] });
    await openDeleteConfirm();

    await userEvent.click(within(deletePopover()).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to delete smart playlist');
    });
    expect(screen.getByText('Delete this smart playlist?')).toBeInTheDocument();
    expect(useViewStore.getState().selectedSmartPlaylistId).toBe(PLAYLIST_ID);
  });
});
