import { SIMILAR_LIMIT, genreTags, similarReasonLabel, similarTracks } from '@/lib/similar';
import type { Track } from '@/stores/usePlayerStore';

const t = (id: string, extra: Partial<Track> = {}): Track => ({
  id,
  title: id,
  artist: 'Other',
  album: 'Unknown Album',
  duration: 120,
  filePath: `file:///${id}.mp3`,
  ...extra,
});

const ids = (entries: { track: Track }[]) => entries.map(e => e.track.id);

describe('similar tracks', () => {
  const current = t('now', { artist: 'hkmori', album: 'Unrequited Love', genre: 'Lo-fi; Bedroom' });

  it('ranks the same artist, then the same album, then a shared genre', () => {
    const library = [
      t('genre', { genre: 'bedroom' }),
      t('album', { artist: 'Guest', album: 'unrequited love ' }),
      t('artist', { artist: 'HKMORI' }),
      t('none', { genre: 'Metal' }),
      current,
    ];
    const result = similarTracks(library, current);
    expect(ids(result)).toEqual(['artist', 'album', 'genre']);
    expect(result.map(e => e.reason)).toEqual(['artist', 'album', 'genre']);
  });

  it('puts the most played first within a group, then by title', () => {
    const library = [
      t('b', { artist: 'hkmori', title: 'B' }),
      t('a', { artist: 'hkmori', title: 'A' }),
      t('hot', { artist: 'hkmori', title: 'Z', playCount: 9 }),
    ];
    expect(ids(similarTracks(library, current))).toEqual(['hot', 'a', 'b']);
  });

  it('never matches on the unknown artist or album placeholders', () => {
    const anon = t('anon', { artist: 'Unknown Artist', album: 'Unknown Album' });
    const library = [t('x', { artist: 'Unknown Artist', album: 'Unknown Album' })];
    expect(similarTracks(library, anon)).toEqual([]);
  });

  it('leaves out the song itself, repeats of it and live streams', () => {
    const library = [
      current,
      t('now', { artist: 'hkmori' }),
      t('radio', { isLive: true, artist: 'hkmori' }),
    ];
    expect(similarTracks(library, current)).toEqual([]);
  });

  it('lists each song once and stops at the limit', () => {
    const many = Array.from({ length: SIMILAR_LIMIT + 5 }, (_, i) =>
      t(`s${i}`, { artist: 'hkmori' })
    );
    const result = similarTracks([...many, many[0]], current);
    expect(result).toHaveLength(SIMILAR_LIMIT);
    expect(new Set(ids(result)).size).toBe(SIMILAR_LIMIT);
    expect(similarTracks(many, current, 3)).toHaveLength(3);
  });

  it('is empty when nothing matches', () => {
    expect(similarTracks([t('x'), t('y', { genre: 'Jazz' })], current)).toEqual([]);
  });
});

describe('genre tags', () => {
  it('splits and normalizes multi-genre fields', () => {
    expect(genreTags(' Lo-fi ; Bedroom/Pop, ,Jazz|J-Pop')).toEqual([
      'lo-fi',
      'bedroom',
      'pop',
      'jazz',
      'j-pop',
    ]);
    expect(genreTags(null)).toEqual([]);
    expect(genreTags('')).toEqual([]);
  });

  it('labels why a song is listed', () => {
    expect(similarReasonLabel('album')).toBe('Same album');
  });
});
