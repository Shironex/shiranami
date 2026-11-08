import { albumMeta, findAlbum, groupAlbums, hasAlbum } from '@/lib/albums';
import type { Track } from '@/stores/usePlayerStore';

const t = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: id,
  artist: 'Kupla',
  album: 'Kingdom in Blue',
  duration: 150,
  filePath: `file:///${id}.mp3`,
  ...extra,
});

describe('albums', () => {
  it('groups by album and artist, skipping songs without an album', () => {
    const albums = groupAlbums([
      t('b', { trackNumber: 2, albumArt: 'file:///kib.jpg' }),
      t('a', { trackNumber: 1 }),
      t('memo', { album: 'Unknown Album', artist: 'Unknown Artist' }),
      t('x', { album: 'Kingdom in Blue', artist: 'Someone Else' }),
      t('h', { album: 'Hiraeth', artist: 'Idealism', year: 2019 }),
    ]);
    expect(albums.map(a => [a.title, a.artist, a.tracks.map(x => x.id)])).toEqual([
      ['Hiraeth', 'Idealism', ['h']],
      ['Kingdom in Blue', 'Kupla', ['a', 'b']],
      ['Kingdom in Blue', 'Someone Else', ['x']],
    ]);
    expect(albums[1].art).toBe('file:///kib.jpg');
    expect(albums[0].year).toBe(2019);
  });

  it('orders tracks by number, then title for untagged ones', () => {
    const [album] = groupAlbums([t('c'), t('b', { trackNumber: 2 }), t('a')]);
    expect(album.tracks.map(x => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('finds one album by its names', () => {
    const library = [t('a'), t('x', { artist: 'Other' })];
    expect(findAlbum(library, 'Kingdom in Blue', 'Kupla')?.tracks.map(x => x.id)).toEqual(['a']);
    expect(findAlbum(library, 'Missing', 'Kupla')).toBeNull();
  });

  it('knows an untagged album', () => {
    expect(hasAlbum(t('a', { album: '' }))).toBe(false);
    expect(hasAlbum(t('a', { album: 'Unknown Album' }))).toBe(false);
    expect(hasAlbum(t('a'))).toBe(true);
  });

  it('describes the year, count and length', () => {
    expect(
      albumMeta({ year: 2019, tracks: [t('a', { duration: 600 }), t('b', { duration: 540 })] })
    ).toBe('2019 · 2 songs, 19 min');
    expect(albumMeta({ tracks: [t('a', { duration: 0 })] })).toBe('1 song');
  });
});
