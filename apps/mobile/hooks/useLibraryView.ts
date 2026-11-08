import { useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { groupByDate, parseSqlTime, type DateGroup } from '@/lib/date-groups';
import { countLabel } from '@/lib/format';
import { loadHistory, type HistoryEntry } from '@/lib/history';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

export type LibraryFilter = 'all' | 'favorites' | 'history' | 'artists';
export type LibrarySort = 'recent' | 'title' | 'artist';

export const LIBRARY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'history', label: 'History' },
  { value: 'artists', label: 'Artists' },
] as const;

export const SORT_LABELS: Record<LibrarySort, string> = {
  recent: 'Recent',
  title: 'Title',
  artist: 'Artist',
};
const SORT_ORDER: LibrarySort[] = ['recent', 'title', 'artist'];

const ADDED_LABELS: Record<DateGroup, string> = {
  today: 'Added today',
  week: 'This week',
  earlier: 'Earlier',
};
const PLAYED_LABELS: Record<DateGroup, string> = {
  today: 'Today',
  week: 'This week',
  earlier: 'Earlier',
};

export type LibraryItem =
  | { type: 'label'; key: string; text: string }
  | { type: 'track'; key: string; track: Track; index: number }
  | { type: 'artist'; key: string; name: string; meta: string }
  | { type: 'empty'; key: string; title: string; body: string };

function sortTracks(tracks: Track[], sort: LibrarySort): Track[] {
  if (sort === 'recent') return tracks;
  const key = sort === 'title' ? (t: Track) => t.title : (t: Track) => t.artist;
  return [...tracks].sort((a, b) => key(a).localeCompare(key(b)));
}

function matches(track: Track, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return track.title.toLowerCase().includes(q) || track.artist.toLowerCase().includes(q);
}

/** Track rows, with date labels between groups when `labels` is given. */
function trackItems(
  tracks: Track[],
  dateOf: ((index: number) => Date | null) | null,
  labels: Record<DateGroup, string>,
  keyPrefix: string
): LibraryItem[] {
  const rows = tracks.map((track, index) => ({ track, index }));
  if (!dateOf) {
    return rows.map(({ track, index }) => ({
      type: 'track',
      key: `${keyPrefix}${track.id}-${index}`,
      track,
      index,
    }));
  }
  return groupByDate(rows, row => dateOf(row.index), new Date()).flatMap(({ group, items }) => [
    { type: 'label' as const, key: `label-${group}`, text: labels[group] },
    ...items.map(({ track, index }) => ({
      type: 'track' as const,
      key: `${keyPrefix}${track.id}-${index}`,
      track,
      index,
    })),
  ]);
}

function artistItems(tracks: Track[]): LibraryItem[] {
  const counts = new Map<string, number>();
  for (const track of tracks) counts.set(track.artist, (counts.get(track.artist) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({
      type: 'artist',
      key: `artist-${name}`,
      name,
      meta: countLabel(count, 'song', 'songs'),
    }));
}

const EMPTY: Record<Exclude<LibraryFilter, 'all'>, { title: string; body: string }> = {
  favorites: {
    title: 'No favorites yet',
    body: 'Tap the heart in the player to keep a song here.',
  },
  history: { title: 'Nothing played yet', body: 'Songs you listen to will show up here.' },
  artists: { title: 'No artists yet', body: 'Artists come from the names of imported files.' },
};

/**
 * Everything the Library tab shows, derived from the store and SQLite: the
 * chip filter, sort, artist drill-in and text filter, flattened into rows.
 */
export function useLibraryView() {
  const db = useSQLiteContext();
  const library = usePlayerStore(s => s.library);
  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [artist, setArtist] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // History changes as tracks are left, so it reloads when the playing track does.
  useEffect(() => {
    if (filter !== 'history') return;
    loadHistory(db).then(setHistory);
  }, [db, filter, currentTrackId]);

  const view = useMemo(() => {
    let tracks: Track[] = [];
    let items: LibraryItem[];

    if (filter === 'history') {
      const inLibrary = new Set(library.map(t => t.id));
      const entries = history.filter(
        entry => inLibrary.has(entry.track.id) && matches(entry.track, query)
      );
      tracks = entries.map(entry => entry.track);
      items = trackItems(
        tracks,
        index => parseSqlTime(entries[index].playedAt),
        PLAYED_LABELS,
        'h-'
      );
    } else if (filter === 'artists' && !artist) {
      items = artistItems(library.filter(track => matches(track, query)));
    } else {
      const base =
        filter === 'favorites'
          ? library.filter(t => t.isFavorite)
          : filter === 'artists'
            ? library.filter(t => t.artist === artist)
            : library;
      tracks = sortTracks(
        base.filter(t => matches(t, query)),
        sort
      );
      const grouped = sort === 'recent' && filter !== 'artists';
      items = trackItems(
        tracks,
        grouped ? index => parseSqlTime(tracks[index].addedAt) : null,
        ADDED_LABELS,
        ''
      );
    }

    if (items.length === 0 && filter !== 'all') {
      const empty = query
        ? { title: 'No matches', body: `Nothing here matches "${query.trim()}".` }
        : EMPTY[filter];
      items = [{ type: 'empty', key: 'empty', ...empty }];
    }
    return { tracks, items };
  }, [library, history, filter, sort, artist, query]);

  return {
    ...view,
    total: library.length,
    filter,
    setFilter: (next: LibraryFilter) => {
      setFilter(next);
      setArtist(null);
    },
    sort,
    cycleSort: () => setSort(s => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length]),
    artist,
    setArtist,
    query,
    setQuery,
    /** "Playing from …" for the player. */
    source:
      artist ??
      (filter === 'all' ? 'Library' : LIBRARY_FILTERS.find(f => f.value === filter)!.label),
  };
}
