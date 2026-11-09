import type { AudioLink } from '@/lib/api';
import type { SearchResult } from '@/lib/types';
import {
  SaveCancelledError,
  isSaved,
  saveYouTubeTrack,
  youtubeTrackId,
  type SaveDeps,
} from '@/lib/youtube-save';

const RESULT: SearchResult = {
  id: 'abcdefghijk',
  title: 'Snowfall',
  uploader: 'Night Band',
  duration: 214,
  thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/hq720.jpg',
  url: 'https://www.youtube.com/watch?v=abcdefghijk',
};

const LINK: AudioLink = {
  url: 'http://server/api/youtube/audio/abcdefghijk?t=1.x',
  expiresAt: 2_000_000_000,
  ext: 'm4a',
  size: 1000,
};

function fakeDeps(overrides: Partial<SaveDeps> = {}, existing: string[] = []) {
  const rows = new Set(existing);
  const runAsync = jest.fn(async (_sql: string, params: unknown[]) => {
    rows.add(params[0] as string);
    return { changes: 1, lastInsertRowId: 1 };
  });
  const deps = {
    db: {
      getFirstAsync: jest.fn(async (_sql: string, params: unknown[]) =>
        rows.has(params[0] as string) ? { id: params[0] } : null
      ),
      runAsync,
    },
    audioLink: jest.fn(async () => LINK),
    download: jest.fn(async (_url: string, name: string, options) => {
      options.onBytes?.(250);
      options.onBytes?.(1000);
      return { uri: `file:///docs/tracks/${name}`, size: 1000 };
    }),
    saveCover: jest.fn(async (_url: string, name: string) => `file:///docs/art/${name}`),
    lock: jest.fn(async <T>(job: () => Promise<T>) => job()),
    ...overrides,
  } as unknown as SaveDeps;
  return { deps, runAsync, rows };
}

describe('youtubeTrackId', () => {
  it('prefixes the video id, the same id a streamed result plays under', () => {
    expect(youtubeTrackId('abcdefghijk')).toBe('yt-abcdefghijk');
  });
});

describe('saveYouTubeTrack', () => {
  it('downloads the audio and cover and writes one library row under the lock', async () => {
    const { deps, runAsync } = fakeDeps();
    const progress: number[] = [];

    const outcome = await saveYouTubeTrack(deps, RESULT, { onProgress: r => progress.push(r) });

    expect(outcome).toBe('saved');
    expect(deps.audioLink).toHaveBeenCalledWith('abcdefghijk');
    expect(deps.download).toHaveBeenCalledWith(
      LINK.url,
      'yt-abcdefghijk.m4a',
      expect.objectContaining({ onBytes: expect.any(Function) })
    );
    expect(deps.saveCover).toHaveBeenCalledWith(RESULT.thumbnail, 'yt-abcdefghijk.jpg', undefined);
    expect(deps.lock).toHaveBeenCalledTimes(1);
    expect(runAsync).toHaveBeenCalledTimes(1);
    expect(runAsync.mock.calls[0][0]).toMatch(/INSERT INTO tracks/);
    expect(runAsync.mock.calls[0][1]).toEqual([
      'yt-abcdefghijk',
      'file:///docs/tracks/yt-abcdefghijk.m4a',
      'Snowfall',
      'Night Band',
      214,
      'file:///docs/art/yt-abcdefghijk.jpg',
      1000,
    ]);
    expect(progress).toEqual([0, 0.25, 1, 1]);
  });

  it('does not download a video that is already saved', async () => {
    const { deps, runAsync } = fakeDeps({}, ['yt-abcdefghijk']);

    expect(await saveYouTubeTrack(deps, RESULT)).toBe('already_saved');
    expect(deps.audioLink).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
    expect(runAsync).not.toHaveBeenCalled();
  });

  it('saves the same video once when asked twice in a row', async () => {
    const { deps } = fakeDeps();

    expect(await saveYouTubeTrack(deps, RESULT)).toBe('saved');
    expect(await saveYouTubeTrack(deps, RESULT)).toBe('already_saved');
    expect(deps.download).toHaveBeenCalledTimes(1);
  });

  it('keeps the song when the cover fails, with no art', async () => {
    const { deps, runAsync } = fakeDeps({
      saveCover: jest.fn(async () => {
        throw new Error('no cover');
      }),
    });

    expect(await saveYouTubeTrack(deps, RESULT)).toBe('saved');
    expect(runAsync.mock.calls[0][1][5]).toBeNull();
  });

  it('skips the cover when the result has none', async () => {
    const { deps } = fakeDeps();

    await saveYouTubeTrack(deps, { ...RESULT, thumbnail: '' });

    expect(deps.saveCover).not.toHaveBeenCalled();
  });

  it('falls back to m4a for an odd extension', async () => {
    const { deps } = fakeDeps({ audioLink: jest.fn(async () => ({ ...LINK, ext: '../x' })) });

    await saveYouTubeTrack(deps, RESULT);

    expect((deps.download as jest.Mock).mock.calls[0][1]).toBe('yt-abcdefghijk.m4a');
  });

  it('writes nothing when the download fails', async () => {
    const { deps, runAsync } = fakeDeps({
      download: jest.fn(async () => {
        throw new Error('disk full');
      }),
    });

    await expect(saveYouTubeTrack(deps, RESULT)).rejects.toThrow('disk full');
    expect(runAsync).not.toHaveBeenCalled();
  });

  it('stops before downloading when cancelled while the link was fetched', async () => {
    const controller = new AbortController();
    const { deps, runAsync } = fakeDeps({
      audioLink: jest.fn(async () => {
        controller.abort();
        return LINK;
      }),
    });

    await expect(
      saveYouTubeTrack(deps, RESULT, { signal: controller.signal })
    ).rejects.toBeInstanceOf(SaveCancelledError);
    expect(deps.download).not.toHaveBeenCalled();
    expect(runAsync).not.toHaveBeenCalled();
  });
});

describe('isSaved', () => {
  it('looks the row up by its youtube id, ignoring missing files', async () => {
    const getFirstAsync = jest.fn(async () => null);

    expect(await isSaved({ getFirstAsync } as never, 'abcdefghijk')).toBe(false);
    expect(getFirstAsync).toHaveBeenCalledWith(
      'SELECT id FROM tracks WHERE id = ? AND missing = 0',
      ['yt-abcdefghijk']
    );
  });
});
