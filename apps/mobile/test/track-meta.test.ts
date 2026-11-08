import { parseTrackName, trackFields, trackMeta } from '@/lib/track-meta';

describe('track metadata', () => {
  it('splits "Artist - Title" filenames, keeping later dashes in the title', () => {
    expect(parseTrackName('Nujabes - Feather - Live.flac')).toEqual({
      artist: 'Nujabes',
      title: 'Feather - Live',
    });
    expect(parseTrackName('untitled.ogg')).toEqual({ title: 'untitled', artist: 'Unknown Artist' });
  });

  it('prefers tags and uses the filename only for what they leave out', () => {
    const fields = trackFields(
      {
        contentHash: 'a1:x',
        size: 1,
        title: null,
        artist: null,
        album: 'Modal Soul',
        albumArtist: 'Nujabes',
        trackNumber: 3,
        year: 2005,
        genre: 'Hip hop',
        durationMs: 240500,
        artUri: 'file:///art/x.jpg',
      },
      'Someone - Feather.mp3'
    );
    expect(fields).toEqual({
      title: 'Feather',
      artist: 'Nujabes',
      album: 'Modal Soul',
      albumArtist: 'Nujabes',
      trackNumber: 3,
      year: 2005,
      genre: 'Hip hop',
      duration: 240.5,
      albumArt: 'file:///art/x.jpg',
    });
    expect(trackFields(null, 'A - B.mp3')).toMatchObject({
      title: 'B',
      artist: 'A',
      album: 'Unknown Album',
      duration: null,
      albumArt: null,
    });
  });

  it('shows the album on the meta line only when it is known', () => {
    expect(trackMeta({ artist: 'Nujabes', album: 'Modal Soul' })).toBe('Nujabes · Modal Soul');
    expect(trackMeta({ artist: 'Nujabes', album: 'Unknown Album' })).toBe('Nujabes');
  });
});
