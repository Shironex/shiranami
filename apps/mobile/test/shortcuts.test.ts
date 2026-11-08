import { buildShortcutItems, runShortcut, type ShortcutDeps } from '@/lib/shortcuts';
import type { LastPlayed } from '@/lib/last-played';
import type { RadioStation } from '@/lib/radio';
import type { Track } from '@/stores/usePlayerStore';

function track(id: string): Track {
  return { id, title: id, artist: 'A', album: 'B', duration: 100, filePath: `file:///${id}.mp3` };
}

const station: RadioStation = {
  id: 's1',
  name: 'Lofi Hip Hop Radio',
  url: 'http://x',
  urlResolved: 'http://x/stream',
  homepage: null,
  favicon: null,
  country: null,
  countryCode: null,
  codec: null,
  bitrate: null,
  tags: [],
};

const nothing: LastPlayed = { track: null, station: null };
const ids = (items: { id: string }[]) => items.map(i => i.id);

describe('buildShortcutItems', () => {
  it('offers only Radio when nothing was played and the library is empty', () => {
    expect(ids(buildShortcutItems([], nothing))).toEqual(['radio']);
  });

  it('adds Shuffle once the library has tracks', () => {
    expect(ids(buildShortcutItems([track('a')], nothing))).toEqual(['radio', 'shuffle']);
  });

  it('offers Resume only for a last track that is still in the library', () => {
    const last: LastPlayed = { track: { id: 'a', position: 30 }, station: null };
    expect(ids(buildShortcutItems([track('a')], last))).toEqual(['resume', 'radio', 'shuffle']);
    expect(ids(buildShortcutItems([track('b')], last))).toEqual(['radio', 'shuffle']);
  });

  it('turns Radio into Play <station> after a station played', () => {
    const items = buildShortcutItems([], { track: null, station });
    expect(items).toEqual([
      expect.objectContaining({ id: 'radio-station', title: 'Play Lofi Hip Hop Radio' }),
    ]);
  });

  it('cuts long station names', () => {
    const long = { ...station, name: 'A very long station name that keeps going' };
    const [item] = buildShortcutItems([], { track: null, station: long });
    expect(item.title.length).toBeLessThanOrEqual('Play '.length + 22);
    expect(item.title.endsWith('…')).toBe(true);
  });
});

describe('runShortcut', () => {
  function setup(library: Track[], last: LastPlayed) {
    const deps = {
      getLibrary: () => library,
      getLast: () => last,
      openLibrary: jest.fn(),
      openRadio: jest.fn(),
      playTrack: jest.fn(),
      playShuffled: jest.fn(),
      playStation: jest.fn(),
    } satisfies ShortcutDeps;
    return deps;
  }

  it('resume plays the last track at its saved position', () => {
    const library = [track('a'), track('b')];
    const deps = setup(library, { track: { id: 'b', position: 42 }, station: null });
    runShortcut('resume', deps);
    expect(deps.openLibrary).toHaveBeenCalledTimes(1);
    expect(deps.playTrack).toHaveBeenCalledWith(library, 1, 42);
  });

  it('resume only opens the library when the track is gone', () => {
    const deps = setup([track('a')], { track: { id: 'x', position: 5 }, station: null });
    runShortcut('resume', deps);
    expect(deps.openLibrary).toHaveBeenCalledTimes(1);
    expect(deps.playTrack).not.toHaveBeenCalled();
  });

  it('radio opens the Radio tab without playing', () => {
    const deps = setup([], nothing);
    runShortcut('radio', deps);
    expect(deps.openRadio).toHaveBeenCalledTimes(1);
    expect(deps.playStation).not.toHaveBeenCalled();
  });

  it('radio-station opens Radio and plays the saved station', () => {
    const deps = setup([], { track: null, station });
    runShortcut('radio-station', deps);
    expect(deps.openRadio).toHaveBeenCalledTimes(1);
    expect(deps.playStation).toHaveBeenCalledWith(station);
  });

  it('shuffle plays the whole library shuffled', () => {
    const library = [track('a'), track('b')];
    const deps = setup(library, nothing);
    runShortcut('shuffle', deps);
    expect(deps.playShuffled).toHaveBeenCalledWith(library);
  });

  it('shuffle does nothing on an empty library but still opens it', () => {
    const deps = setup([], nothing);
    runShortcut('shuffle', deps);
    expect(deps.openLibrary).toHaveBeenCalledTimes(1);
    expect(deps.playShuffled).not.toHaveBeenCalled();
  });

  it('ignores an unknown id', () => {
    const deps = setup([track('a')], nothing);
    runShortcut('bogus', deps);
    expect(deps.openLibrary).not.toHaveBeenCalled();
    expect(deps.openRadio).not.toHaveBeenCalled();
  });
});
