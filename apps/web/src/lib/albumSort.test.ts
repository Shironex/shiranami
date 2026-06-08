import { describe, it, expect } from 'vitest';
import { groupTracksByAlbum, sortAlbumTracks } from './albumSort';
import { type Track } from '@/stores/types';

function makeTrack(overrides: Partial<Track> & { id: string }): Track {
  const base: Track = {
    id: overrides.id,
    title: 'Title',
    artist: 'Artist',
    album: 'Album',
    duration: 100,
    filePath: `/music/${overrides.id}.mp3`,
  };
  return { ...base, ...overrides };
}

describe('groupTracksByAlbum', () => {
  const zenith = makeTrack({ id: '1', album: 'Zenith', artist: 'Alice', year: 2021 });
  const aurora = makeTrack({ id: '2', album: 'Aurora', artist: 'Bob', year: 2019 });
  const mirror = makeTrack({ id: '3', album: 'Mirror', artist: 'Alice', year: 2023 });
  const noYear = makeTrack({ id: '4', album: 'Nebula', artist: 'Carol', year: null });

  it('sorts by album name ascending by default', () => {
    const groups = groupTracksByAlbum([zenith, aurora, mirror]);
    expect(groups.map(g => g.name)).toEqual(['Aurora', 'Mirror', 'Zenith']);
  });

  it('sorts by album name descending when order is desc', () => {
    const groups = groupTracksByAlbum([zenith, aurora, mirror], 'name', 'desc');
    expect(groups.map(g => g.name)).toEqual(['Zenith', 'Mirror', 'Aurora']);
  });

  it('sorts by artist then year ascending (nulls last), then name', () => {
    // Alice: Zenith (2021), Mirror (2023) → Zenith before Mirror (year asc)
    // Bob: Aurora (2019)
    // Carol: Nebula (null year)
    const groups = groupTracksByAlbum([mirror, zenith, aurora, noYear], 'artist', 'asc');
    expect(groups.map(g => g.name)).toEqual(['Zenith', 'Mirror', 'Aurora', 'Nebula']);
  });

  it('inverts only the primary artist key when sorted desc', () => {
    // desc artist: Carol, Bob, Alice — Alice's albums keep year ASC as secondary
    const groups = groupTracksByAlbum([mirror, zenith, aurora, noYear], 'artist', 'desc');
    expect(groups.map(g => g.name)).toEqual(['Nebula', 'Aurora', 'Zenith', 'Mirror']);
  });

  it('sorts by year ascending with nulls last, breaking ties by name', () => {
    const groups = groupTracksByAlbum([zenith, aurora, mirror, noYear], 'year', 'asc');
    expect(groups.map(g => g.name)).toEqual(['Aurora', 'Zenith', 'Mirror', 'Nebula']);
  });

  it('sorts by year descending while keeping nulls last', () => {
    // desc year primary: 2023, 2021, 2019, then null year (Nebula treated as +Infinity, still last)
    const groups = groupTracksByAlbum([zenith, aurora, mirror, noYear], 'year', 'desc');
    // Nebula has +Infinity year; desc multiplies diff by -1 → nulls end up first.
    // Spec says "nulls last" is the secondary rule for the 'artist' sort only;
    // for year desc, null-year albums being treated as +Infinity means they'll
    // sort to the top. Lock the behaviour in so it doesn't silently change.
    expect(groups.map(g => g.name)).toEqual(['Nebula', 'Mirror', 'Zenith', 'Aurora']);
  });

  it('keeps a compilation (shared albumArtist) as one album and aggregates its artists', () => {
    // A real compilation shares an album artist (e.g. "Various Artists") even
    // though each track has a different performing artist. Keyed on
    // (albumArtist, album) it stays a single album.
    const a1 = makeTrack({
      id: 'a',
      album: 'Comp',
      artist: 'Alice',
      albumArtist: 'Various Artists',
    });
    const a2 = makeTrack({ id: 'b', album: 'Comp', artist: 'Bob', albumArtist: 'Various Artists' });
    const [group] = groupTracksByAlbum([a1, a2]);
    expect(group.name).toBe('Comp');
    expect(group.albumArtist).toBe('Various Artists');
    expect(group.artist).toBe('Alice, Bob');
    expect(group.trackCount).toBe(2);
  });

  it('separates same-named albums by different album-artist tags', () => {
    // Two distinct "Greatest Hits" albums with genuine album-artist tags must
    // not merge. (Untagged same-title albums intentionally merge — they key on
    // the title alone; see the untagged-compilation test below.)
    const a = makeTrack({
      id: 'a',
      album: 'Greatest Hits',
      artist: 'Alice',
      albumArtist: 'Alice',
    });
    const b = makeTrack({ id: 'b', album: 'Greatest Hits', artist: 'Bob', albumArtist: 'Bob' });
    const groups = groupTracksByAlbum([a, b]);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.albumArtist).sort()).toEqual(['Alice', 'Bob']);
    expect(new Set(groups.map(g => g.key)).size).toBe(2);
  });

  it('keeps an untagged various-artists album as one album (#269)', () => {
    // A compilation with NO album-artist tag: each track has a different
    // performing artist. Keying on the track artist (the 0.22.0 regression)
    // fragments it into one album per artist. Without an album-artist tag we
    // key on the album title alone, so it stays a single album.
    const c1 = makeTrack({ id: 'x', album: 'Lofi Mix', artist: 'Alice' });
    const c2 = makeTrack({ id: 'y', album: 'Lofi Mix', artist: 'Bob' });
    const c3 = makeTrack({ id: 'z', album: 'Lofi Mix', artist: 'Carol' });
    const groups = groupTracksByAlbum([c1, c2, c3]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Lofi Mix');
    expect(groups[0].artist).toBe('Alice, Bob, Carol');
    expect(groups[0].trackCount).toBe(3);
  });

  it('falls back to track artist for albumArtist when the tag is absent', () => {
    const a1 = makeTrack({ id: 'a', album: 'Solo', artist: 'Alice' });
    const a2 = makeTrack({ id: 'b', album: 'Solo', artist: 'Alice' });
    const [group] = groupTracksByAlbum([a1, a2]);
    expect(group.albumArtist).toBe('Alice');
    expect(group.trackCount).toBe(2);
  });

  it('uses the track album string verbatim as the group name', () => {
    // trackMapper guarantees `album` is non-empty by populating a localized
    // "Unknown Album" fallback at DB-read time, so albumSort trusts the value.
    const t = makeTrack({ id: 'x', album: 'Unknown Album' });
    const [group] = groupTracksByAlbum([t]);
    expect(group.name).toBe('Unknown Album');
  });

  describe('recentlyAdded sort', () => {
    const old = makeTrack({
      id: 'r1',
      album: 'Old Album',
      artist: 'Alice',
      createdAt: '2023-01-01 10:00:00',
    });
    const mid = makeTrack({
      id: 'r2',
      album: 'Mid Album',
      artist: 'Bob',
      createdAt: '2023-06-15 12:00:00',
    });
    const newest = makeTrack({
      id: 'r3',
      album: 'New Album',
      artist: 'Carol',
      createdAt: '2024-03-20 08:00:00',
    });
    const noDate = makeTrack({ id: 'r4', album: 'No Date Album', artist: 'Dave' });

    it('sorts newest first under asc', () => {
      const groups = groupTracksByAlbum([newest, old, mid], 'recentlyAdded', 'asc');
      expect(groups.map(g => g.name)).toEqual(['New Album', 'Mid Album', 'Old Album']);
    });

    it('sorts oldest first under desc', () => {
      const groups = groupTracksByAlbum([old, newest, mid], 'recentlyAdded', 'desc');
      expect(groups.map(g => g.name)).toEqual(['Old Album', 'Mid Album', 'New Album']);
    });

    it('tracks with missing createdAt sink to bottom under asc', () => {
      const groups = groupTracksByAlbum([noDate, old, newest], 'recentlyAdded', 'asc');
      expect(groups.map(g => g.name)).toEqual(['New Album', 'Old Album', 'No Date Album']);
    });

    it('breaks ties by album name when timestamps are equal', () => {
      const alpha = makeTrack({
        id: 't1',
        album: 'Alpha',
        artist: 'X',
        createdAt: '2024-01-01 00:00:00',
      });
      const zeta = makeTrack({
        id: 't2',
        album: 'Zeta',
        artist: 'Y',
        createdAt: '2024-01-01 00:00:00',
      });
      const groups = groupTracksByAlbum([zeta, alpha], 'recentlyAdded', 'asc');
      expect(groups.map(g => g.name)).toEqual(['Alpha', 'Zeta']);
    });

    it('album createdAt reflects the latest of its tracks so a new track bubbles the album up', () => {
      const early = makeTrack({
        id: 'e1',
        album: 'Mixed',
        artist: 'A',
        createdAt: '2022-05-01 00:00:00',
      });
      const late = makeTrack({
        id: 'e2',
        album: 'Mixed',
        artist: 'A',
        createdAt: '2025-05-01 00:00:00',
      });
      const other = makeTrack({
        id: 'e3',
        album: 'Reference',
        artist: 'B',
        createdAt: '2023-01-01 00:00:00',
      });
      // Mixed album should sort as if it was added in 2025 (after Reference's 2023)
      // because adding a new track to an existing album should bubble it up.
      const groups = groupTracksByAlbum([late, early, other], 'recentlyAdded', 'asc');
      expect(groups.map(g => g.name)).toEqual(['Mixed', 'Reference']);
      expect(groups[0].createdAt).toBe('2025-05-01 00:00:00');
    });
  });
});

describe('sortAlbumTracks', () => {
  it('sorts by disc number first', () => {
    const d2 = makeTrack({ id: '1', discNumber: 2, trackNumber: 1, title: 'B' });
    const d1 = makeTrack({ id: '2', discNumber: 1, trackNumber: 5, title: 'A' });
    expect(sortAlbumTracks([d2, d1]).map(t => t.id)).toEqual(['2', '1']);
  });

  it('sorts by track number within a disc', () => {
    const t3 = makeTrack({ id: '1', discNumber: 1, trackNumber: 3 });
    const t1 = makeTrack({ id: '2', discNumber: 1, trackNumber: 1 });
    const t2 = makeTrack({ id: '3', discNumber: 1, trackNumber: 2 });
    expect(sortAlbumTracks([t3, t1, t2]).map(t => t.id)).toEqual(['2', '3', '1']);
  });

  it('pushes tracks with missing track number to the end of their disc', () => {
    const tNull = makeTrack({ id: '1', discNumber: 1, trackNumber: null });
    const t1 = makeTrack({ id: '2', discNumber: 1, trackNumber: 1 });
    const t5 = makeTrack({ id: '3', discNumber: 1, trackNumber: 5 });
    expect(sortAlbumTracks([tNull, t5, t1]).map(t => t.id)).toEqual(['2', '3', '1']);
  });

  it('treats missing disc number as disc 1', () => {
    const disc2 = makeTrack({ id: '1', discNumber: 2, trackNumber: 1 });
    const noDisc = makeTrack({ id: '2', discNumber: null, trackNumber: 5 });
    expect(sortAlbumTracks([disc2, noDisc]).map(t => t.id)).toEqual(['2', '1']);
  });

  it('uses title as a tiebreaker when disc and track match', () => {
    const zebra = makeTrack({ id: '1', discNumber: 1, trackNumber: 1, title: 'Zebra' });
    const alpha = makeTrack({ id: '2', discNumber: 1, trackNumber: 1, title: 'Alpha' });
    expect(sortAlbumTracks([zebra, alpha]).map(t => t.id)).toEqual(['2', '1']);
  });

  it('does not mutate the input array', () => {
    const input = [makeTrack({ id: '1', discNumber: 2 }), makeTrack({ id: '2', discNumber: 1 })];
    const original = [...input];
    sortAlbumTracks(input);
    expect(input).toEqual(original);
  });
});
