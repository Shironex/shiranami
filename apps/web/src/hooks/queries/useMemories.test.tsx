import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListeningStatsSummary, ListeningStatsTrack } from '@/types/electron';
import { getMemoryWindows, useOnThisNightQuery } from './useMemories';

function makeTrack(overrides: Partial<ListeningStatsTrack> = {}): ListeningStatsTrack {
  return {
    trackId: 't1',
    title: 'Kiro',
    artist: 'Shironami',
    album: 'Night Drift',
    albumArt: null,
    playCount: 4,
    listenedSeconds: 900,
    lastPlayedAt: '2025-08-14T23:00:00.000Z',
    ...overrides,
  };
}

function makeSummary(topTracks: ListeningStatsTrack[]): ListeningStatsSummary {
  return {
    totalPlays: topTracks.reduce((sum, track) => sum + track.playCount, 0),
    totalMinutes: 42,
    uniqueTracks: topTracks.length,
    uniqueArtists: topTracks.length,
    completedPlays: 0,
    topTracks,
    topArtists: [],
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('getMemoryWindows', () => {
  it('prefers a year back, then six months, each ±3 days around the anchor', () => {
    const now = new Date(2026, 7, 14, 22, 30);
    const [year, halfYear] = getMemoryWindows(now);

    expect(year.distance).toBe('year');
    expect(year.anchor.getFullYear()).toBe(2025);
    expect(year.anchor.getMonth()).toBe(7);
    expect(year.anchor.getDate()).toBe(14);
    expect(new Date(year.since).getDate()).toBe(11);
    expect(new Date(year.until).getDate()).toBe(17);

    expect(halfYear.distance).toBe('halfYear');
    expect(halfYear.anchor.getFullYear()).toBe(2026);
    expect(halfYear.anchor.getMonth()).toBe(1);
    expect(halfYear.anchor.getDate()).toBe(14);
  });

  it('keeps the time of day on the anchor so "tonight" means tonight', () => {
    const now = new Date(2026, 7, 14, 22, 30);
    const [year] = getMemoryWindows(now);
    expect(year.anchor.getHours()).toBe(22);
  });
});

describe('useOnThisNightQuery', () => {
  const getSummary = vi.mocked(window.electronAPI.db.history.getSummary);

  beforeEach(() => {
    getSummary.mockReset();
  });

  it('returns the year-old memory when that window has plays', async () => {
    getSummary.mockResolvedValue(makeSummary([makeTrack()]));

    const { result } = renderHook(() => useOnThisNightQuery(true), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeUndefined());

    expect(getSummary).toHaveBeenCalledTimes(1);
    expect(result.current.data?.distance).toBe('year');
    expect(result.current.data?.track.title).toBe('Kiro');
  });

  it('falls back to six months when the year-old window is silent', async () => {
    getSummary
      .mockResolvedValueOnce(makeSummary([]))
      .mockResolvedValueOnce(makeSummary([makeTrack({ title: 'Yoru' })]));

    const { result } = renderHook(() => useOnThisNightQuery(true), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeUndefined());

    expect(getSummary).toHaveBeenCalledTimes(2);
    expect(result.current.data?.distance).toBe('halfYear');
    expect(result.current.data?.track.title).toBe('Yoru');
  });

  it('resolves to null when both windows are silent', async () => {
    getSummary.mockResolvedValue(makeSummary([]));

    const { result } = renderHook(() => useOnThisNightQuery(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
  });

  it('does not query at all while the widget is toggled off', () => {
    renderHook(() => useOnThisNightQuery(false), { wrapper });
    expect(getSummary).not.toHaveBeenCalled();
  });
});
