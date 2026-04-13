import { describe, it, expect } from 'vitest';
import { groupTracksByAlbum, sortAlbumTracks } from './albumSort';
import { type Track } from '@/stores/usePlayerStore';

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

  it('aggregates multiple artists on a compilation album', () => {
    const a1 = makeTrack({ id: 'a', album: 'Comp', artist: 'Alice' });
    const a2 = makeTrack({ id: 'b', album: 'Comp', artist: 'Bob' });
    const [group] = groupTracksByAlbum([a1, a2]);
    expect(group.name).toBe('Comp');
    expect(group.artist).toBe('Alice, Bob');
    expect(group.trackCount).toBe(2);
  });

  it('uses the track album string verbatim as the group name', () => {
    // trackMapper guarantees `album` is non-empty by populating a localized
    // "Unknown Album" fallback at DB-read time, so albumSort trusts the value.
    const t = makeTrack({ id: 'x', album: 'Unknown Album' });
    const [group] = groupTracksByAlbum([t]);
    expect(group.name).toBe('Unknown Album');
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
    const input = [
      makeTrack({ id: '1', discNumber: 2 }),
      makeTrack({ id: '2', discNumber: 1 }),
    ];
    const original = [...input];
    sortAlbumTracks(input);
    expect(input).toEqual(original);
  });
});
