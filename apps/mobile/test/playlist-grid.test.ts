import { mosaicCovers, playlistRows } from '@/lib/playlist-grid';
import type { Track } from '@/stores/usePlayerStore';

const track = (id: string, albumArt?: string): Track =>
  ({ id, title: id, artist: 'A', album: '', duration: 60, filePath: '', albumArt }) as Track;

describe('mosaicCovers', () => {
  it('takes the first four distinct covers', () => {
    const tracks = ['a', 'a', 'b', 'c', undefined, 'd', 'e'].map((art, i) => track(`t${i}`, art));
    expect(mosaicCovers(tracks)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('falls back to one cover when there are not four', () => {
    expect(mosaicCovers([track('1', 'a'), track('2', 'b'), track('3')])).toEqual(['a']);
  });

  it('is empty without covers', () => {
    expect(mosaicCovers([track('1'), track('2')])).toEqual([]);
    expect(mosaicCovers([])).toEqual([]);
  });
});

describe('playlistRows', () => {
  const entry = (id: string) => ({ playlist: { id } });

  it('puts Favorites first and New playlist last, two to a row', () => {
    const rows = playlistRows([entry('p1'), entry('p2'), entry('p3')]);
    expect(rows.map(r => r.map(c => c.key))).toEqual([['favorites', 'p1'], ['p2', 'p3'], ['new']]);
  });

  it('still offers Favorites and New playlist with no playlists', () => {
    expect(playlistRows([]).map(r => r.map(c => c.type))).toEqual([['favorites', 'new']]);
  });
});
