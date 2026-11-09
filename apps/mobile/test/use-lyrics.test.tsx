import { act, renderHook } from '@testing-library/react-native';
import { useLyrics } from '@/hooks/useLyrics';

interface Pending {
  resolve: (body: unknown) => void;
}

const pending: Pending[] = [];

beforeEach(() => {
  pending.length = 0;
  globalThis.fetch = jest.fn(
    () =>
      new Promise(resolve => {
        pending.push({ resolve: body => resolve({ ok: true, json: () => Promise.resolve(body) }) });
      })
  ) as unknown as typeof fetch;
});

describe('useLyrics', () => {
  it('drops the lines of the song before while the next song loads', async () => {
    const { result, rerender } = await renderHook(
      ({ title }: { title: string }) => useLyrics(title, 'Artist'),
      { initialProps: { title: 'First song' } }
    );
    await act(async () => pending[0].resolve({ syncedLyrics: '[00:01.00] first line' }));
    expect(result.current.lyrics.synced?.[0]?.text).toBe('first line');
    expect(result.current.loading).toBe(false);

    await rerender({ title: 'Second song' });
    expect(result.current.loading).toBe(true);
    expect(result.current.lyrics).toEqual({ synced: null, plain: null });

    await act(async () => pending[1].resolve({ plainLyrics: 'second words' }));
    expect(result.current.lyrics.plain).toBe('second words');
    expect(result.current.loading).toBe(false);
  });

  it('ends loading when a newer request for the same song never answers', async () => {
    const { result, rerender } = await renderHook(
      ({ duration }: { duration?: number }) => useLyrics('Same song', 'Artist', 'Album', duration),
      { initialProps: { duration: undefined as number | undefined } }
    );
    expect(result.current.loading).toBe(true);

    // The duration arrives while the first request is out: a second one starts.
    await rerender({ duration: 200 });
    expect(pending).toHaveLength(2);

    await act(async () => pending[0].resolve({ plainLyrics: 'same words' }));
    expect(result.current.loading).toBe(false);
    expect(result.current.lyrics.plain).toBe('same words');
  });

  it('keeps the result of the newer request when it answers later', async () => {
    const { result, rerender } = await renderHook(
      ({ duration }: { duration?: number }) => useLyrics('Later song', 'Artist', 'Album', duration),
      { initialProps: { duration: undefined as number | undefined } }
    );
    await rerender({ duration: 180 });
    await act(async () => pending[0].resolve({ plainLyrics: 'first answer' }));
    await act(async () => pending[1].resolve({ plainLyrics: 'second answer' }));
    expect(result.current.loading).toBe(false);
    expect(result.current.lyrics.plain).toBe('second answer');
  });

  it('drops a late result for a song already left', async () => {
    const { result, rerender } = await renderHook(
      ({ title }: { title: string }) => useLyrics(title, 'Artist'),
      { initialProps: { title: 'Left song' } }
    );
    await rerender({ title: 'Next song' });
    await act(async () => pending[0].resolve({ plainLyrics: 'left words' }));
    expect(result.current.loading).toBe(true);
    expect(result.current.lyrics.plain).toBeNull();
  });
});
