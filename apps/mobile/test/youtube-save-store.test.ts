import { ApiError, type AudioLink } from '@/lib/api';
import type { SearchResult } from '@/lib/types';
import { SaveCancelledError, type SaveDeps } from '@/lib/youtube-save';
import { useYouTubeSaveStore } from '@/stores/useYouTubeSaveStore';

const RESULT: SearchResult = {
  id: 'abcdefghijk',
  title: 'Snowfall',
  uploader: 'Night Band',
  duration: 214,
  thumbnail: '',
  url: 'https://www.youtube.com/watch?v=abcdefghijk',
};

const LINK: AudioLink = { url: 'http://server/a', expiresAt: 2_000_000_000, ext: 'm4a', size: 100 };

/** Deps whose download waits until the test lets it finish or fail. */
function controllableDeps() {
  let finish: () => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  let report: (bytes: number) => void = () => undefined;
  const download = jest.fn(
    (
      _url: string,
      name: string,
      options: { signal?: AbortSignal; onBytes?: (n: number) => void }
    ) =>
      new Promise<{ uri: string; size: number }>((resolve, reject) => {
        report = bytes => options.onBytes?.(bytes);
        finish = () => resolve({ uri: `file:///tracks/${name}`, size: 100 });
        fail = reject;
        options.signal?.addEventListener('abort', () => reject(new SaveCancelledError()));
      })
  );
  const deps = {
    db: {
      getFirstAsync: jest.fn(async () => null),
      runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 1 })),
    },
    audioLink: jest.fn(async () => LINK),
    download,
    saveCover: jest.fn(),
    lock: <T>(job: () => Promise<T>) => job(),
  } as unknown as SaveDeps;
  return {
    deps,
    download,
    finish: () => finish(),
    fail: (error: unknown) => fail(error),
    report: (bytes: number) => report(bytes),
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const job = () => useYouTubeSaveStore.getState().jobs[RESULT.id];

beforeEach(() => {
  useYouTubeSaveStore.setState({ jobs: {} });
});

describe('useYouTubeSaveStore', () => {
  it('tracks progress, then clears the job and reloads the library once saved', async () => {
    const { deps, finish, report } = controllableDeps();
    const onSaved = jest.fn();

    const running = useYouTubeSaveStore.getState().save(deps, RESULT, onSaved);
    await flush();
    expect(job()).toEqual({ status: 'saving', progress: 0 });

    report(42);
    expect(job()).toEqual({ status: 'saving', progress: 0.42 });

    finish();
    await running;
    expect(job()).toBeUndefined();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('ignores a second save of a video that is already saving', async () => {
    const { deps, download, finish } = controllableDeps();
    const first = useYouTubeSaveStore.getState().save(deps, RESULT);
    await flush();

    await useYouTubeSaveStore.getState().save(deps, RESULT);
    finish();
    await first;

    expect(download).toHaveBeenCalledTimes(1);
  });

  it('drops the job without an error when cancelled', async () => {
    const { deps } = controllableDeps();
    const onSaved = jest.fn();
    const running = useYouTubeSaveStore.getState().save(deps, RESULT, onSaved);
    await flush();

    useYouTubeSaveStore.getState().cancel(RESULT.id);
    await running;

    expect(job()).toBeUndefined();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('keeps a failed save with a plain message, until dismissed or retried', async () => {
    const { deps, fail } = controllableDeps();
    const running = useYouTubeSaveStore.getState().save(deps, RESULT);
    await flush();

    fail(new ApiError('unreachable'));
    await running;
    expect(job()).toEqual({ status: 'failed', error: "Can't reach the server" });

    useYouTubeSaveStore.getState().dismiss(RESULT.id);
    expect(job()).toBeUndefined();
  });

  it('can retry after a failure', async () => {
    const first = controllableDeps();
    const running = useYouTubeSaveStore.getState().save(first.deps, RESULT);
    await flush();
    first.fail(new Error('disk full'));
    await running;
    expect(job()).toEqual({ status: 'failed', error: "Couldn't save, try again" });

    const second = controllableDeps();
    const retry = useYouTubeSaveStore.getState().save(second.deps, RESULT);
    await flush();
    expect(job()).toEqual({ status: 'saving', progress: 0 });
    second.finish();
    await retry;
    expect(job()).toBeUndefined();
  });
});
