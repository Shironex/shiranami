import { buildLibraryView, type LibraryViewInput } from '@/hooks/useLibraryView';
import { groupAlbums } from '@/lib/albums';
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

const library = [t('a'), t('b', { artist: 'Idealism', album: 'Hiraeth' }), t('c')];

function view(extra: Partial<LibraryViewInput>) {
  return buildLibraryView({
    library,
    albums: groupAlbums(library),
    history: [],
    filter: 'all',
    sort: 'recent',
    query: '',
    ...extra,
  });
}

const ids = (tracks: Track[]) => tracks.map(x => x.id);

describe('buildLibraryView playable', () => {
  it('plays the listed songs', () => {
    expect(ids(view({}).playable)).toEqual(['a', 'b', 'c']);
    expect(ids(view({ query: 'idealism' }).playable)).toEqual(['b']);
  });

  it('plays nothing on an empty view instead of the whole library', () => {
    expect(view({ filter: 'favorites' }).playable).toEqual([]);
    expect(view({ filter: 'history' }).playable).toEqual([]);
    expect(view({ query: 'nothing like this' }).playable).toEqual([]);
    expect(view({ filter: 'albums', query: 'nothing like this' }).playable).toEqual([]);
    expect(view({ filter: 'artists', query: 'nothing like this' }).playable).toEqual([]);
  });

  it('plays the songs behind the albums or artists on screen', () => {
    expect(ids(view({ filter: 'albums' }).playable).sort()).toEqual(['a', 'b', 'c']);
    expect(ids(view({ filter: 'albums', query: 'hiraeth' }).playable)).toEqual(['b']);
    expect(ids(view({ filter: 'artists', query: 'kupla' }).playable)).toEqual(['a', 'c']);
  });

  it('plays favorites and history when they have songs', () => {
    const favorites = view({
      library: [t('a', { isFavorite: true }), t('b')],
      filter: 'favorites',
    });
    expect(ids(favorites.playable)).toEqual(['a']);
    const history = view({
      filter: 'history',
      history: [{ key: '1', track: library[2], playedAt: '2026-11-08 10:00:00' }],
    });
    expect(ids(history.playable)).toEqual(['c']);
  });
});
