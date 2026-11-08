import { useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { groupAlbums, type Album } from '@/lib/albums';
import { groupByDate, parseSqlTime, type DateGroup } from '@/lib/date-groups';
import { countLabel } from '@/lib/format';
import { loadHistory, type HistoryEntry } from '@/lib/history';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

export type LibraryFilter = 'all' | 'favorites' | 'albums' | 'artists' | 'history';
export type LibrarySort = 'recent' | 'title' | 'artist';

export const LIBRARY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'albums', label: 'Albums' },
  { value: 'artists', label: 'Artists' },
  { value: 'history', label: 'History' },
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
  | { type: 'label'; key: string; text: string; letter?: boolean }
  | { type: 'albums'; key: string; albums: Album[] }
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

/** The A to Z group of a name: its first letter, or # for digits and symbols. */
export function letterOf(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/** Rows with a letter label before each new first letter (lists sorted by name). */
function letterItems(tracks: Track[], nameOf: (t: Track) => string): LibraryItem[] {
  const items: LibraryItem[] = [];
  let last = '';
  tracks.forEach((track, index) => {
    const letter = letterOf(nameOf(track));
    if (letter !== last) {
      items.push({ type: 'label', key: `letter-${letter}`, text: letter, letter: true });
      last = letter;
    }
    items.push({ type: 'track', key: `${track.id}-${index}`, track, index });
  });
  return items;
}

/** Albums two to a row, for the cover grid. */
function albumItems(albums: Album[]): LibraryItem[] {
  const rows: LibraryItem[] = [];
  for (let i = 0; i < albums.length; i += 2) {
    rows.push({ type: 'albums', key: `albums-${albums[i].key}`, albums: albums.slice(i, i + 2) });
  }
  return rows;
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
  albums: {
    title: 'No albums yet',
    body: 'Albums come from the tags of scanned and imported songs.',
  },
  favorites: {
    title: 'No favorites yet',
    body: 'Tap the heart in the player to keep a song here.',
  },
  history: { title: 'Nothing played yet', body: 'Songs you listen to will show up here.' },
  artists: { title: 'No artists yet', body: 'Artists come from the names of imported files.' },
};

/**
 * Everything the Library tab shows, derived from the store and SQLite: the
 * chip filter, sort and text filter, flattened into rows.
 */
export function useLibraryView() {
  const db = useSQLiteContext();
  const library = usePlayerStore(s => s.library);
  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // History changes as tracks are left, so it reloads when the playing track does.
  useEffect(() => {
    if (filter !== 'history') return;
    loadHistory(db).then(setHistory);
  }, [db, filter, currentTrackId]);

  const albums = useMemo(() => groupAlbums(library), [library]);

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
    } else if (filter === 'artists') {
      items = artistItems(library.filter(track => matches(track, query)));
    } else if (filter === 'albums') {
      const q = query.trim().toLowerCase();
      items = albumItems(
        albums.filter(
          a => !q || a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
        )
      );
    } else {
      const base = filter === 'favorites' ? library.filter(t => t.isFavorite) : library;
      tracks = sortTracks(
        base.filter(t => matches(t, query)),
        sort
      );
      items =
        sort === 'recent'
          ? trackItems(tracks, index => parseSqlTime(tracks[index].addedAt), ADDED_LABELS, '')
          : letterItems(tracks, sort === 'title' ? t => t.title : t => t.artist);
    }

    if (items.length === 0 && filter !== 'all') {
      const empty = query
        ? { title: 'No matches', body: `Nothing here matches "${query.trim()}".` }
        : EMPTY[filter];
      items = [{ type: 'empty', key: 'empty', ...empty }];
    }
    return { tracks, items };
  }, [library, albums, history, filter, sort, query]);

  return {
    ...view,
    total: library.length,
    albumCount: albums.length,
    filter,
    setFilter,
    sort,
    cycleSort: () => setSort(s => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length]),
    query,
    setQuery,
    /** "Playing from …" for the player. */
    source: filter === 'all' ? 'Library' : LIBRARY_FILTERS.find(f => f.value === filter)!.label,
  };
}
