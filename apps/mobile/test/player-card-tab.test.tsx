import { act, renderHook } from '@testing-library/react-native';
import { useLyrics } from '@/hooks/useLyrics';
import { usePlayerFold } from '@/hooks/usePlayerFold';
import { usePlayerViewStore } from '@/stores/usePlayerViewStore';

let mockMode: 'auto' | 'open' | 'folded' = 'open';
jest.mock('@/context/SettingsContext', () => ({
  useSettingsContext: () => ({ settings: { playerCard: mockMode }, update: jest.fn() }),
}));

/** Fetches that answer only when the test says so, by song title. */
const pending = new Map<string, (body: unknown) => void>();

function answer(title: string, body: unknown) {
  const resolve = pending.get(title);
  if (!resolve) throw new Error(`no request for ${title}`);
  pending.delete(title);
  return act(async () => resolve(body));
}

const SYNCED = { syncedLyrics: '[00:01.00] a line' };
const NONE = {};

interface Song {
  id: string;
  title: string;
}

/** What the player screen wires together: the song's lyrics and the card's tab. */
function usePlayerCard({ id, title }: Song) {
  const { lyrics, loading } = useLyrics(title, 'Artist');
  const hasLyrics = !!(lyrics.synced || lyrics.plain);
  return usePlayerFold(id, false, hasLyrics, loading);
}

beforeEach(() => {
  mockMode = 'open';
  pending.clear();
  usePlayerViewStore.setState({ tab: 'lyrics', picked: false });
  globalThis.fetch = jest.fn((url: string) => {
    const title = new URL(url).searchParams.get('track_name') ?? '';
    return new Promise(resolve => {
      pending.set(title, body => resolve({ ok: true, json: () => Promise.resolve(body) }));
    });
  }) as unknown as typeof fetch;
});

// Titles are unique per test: the lyrics cache lives for the whole run.
describe('player card tab', () => {
  it('opens Lyrics for a song with lyrics after a song without (not cached)', async () => {
    const first = await renderHook(() => usePlayerCard({ id: 'a', title: 'No words 1' }));
    await answer('No words 1', NONE);
    expect(first.result.current.tab).toBe('upNext');
    await first.unmount();

    const second = await renderHook(() => usePlayerCard({ id: 'b', title: 'Words 1' }));
    expect(second.result.current.tab).toBe('upNext');
    await answer('Words 1', SYNCED);
    expect(second.result.current.tab).toBe('lyrics');
  });

  it('opens Lyrics for a song with lyrics after a song without (cached)', async () => {
    const warm = await renderHook(() => usePlayerCard({ id: 'b', title: 'Words 2' }));
    await answer('Words 2', SYNCED);
    await warm.unmount();

    const first = await renderHook(() => usePlayerCard({ id: 'a', title: 'No words 2' }));
    await answer('No words 2', NONE);
    expect(first.result.current.tab).toBe('upNext');
    await first.unmount();

    const second = await renderHook(() => usePlayerCard({ id: 'b', title: 'Words 2' }));
    expect(second.result.current.tab).toBe('lyrics');
  });

  it('follows the song when it changes on an open player', async () => {
    const { result, rerender } = await renderHook((song: Song) => usePlayerCard(song), {
      initialProps: { id: 'a', title: 'No words 3' },
    });
    await answer('No words 3', NONE);
    expect(result.current.tab).toBe('upNext');

    await rerender({ id: 'b', title: 'Words 3' });
    await answer('Words 3', SYNCED);
    expect(result.current.tab).toBe('lyrics');
  });

  it('keeps a tab the user taps while the lyrics load', async () => {
    usePlayerViewStore.setState({ tab: 'upNext', picked: false });
    const { result } = await renderHook(() => usePlayerCard({ id: 'b', title: 'Words 4' }));
    await act(async () => result.current.onTab('similar'));
    await answer('Words 4', SYNCED);
    expect(result.current.tab).toBe('similar');
  });

  it('opens Lyrics in auto mode too', async () => {
    mockMode = 'auto';
    usePlayerViewStore.setState({ tab: 'upNext', picked: false });
    const { result } = await renderHook(() => usePlayerCard({ id: 'b', title: 'Words 5' }));
    expect(result.current.folded).toBe(false);
    await answer('Words 5', SYNCED);
    expect(result.current.tab).toBe('lyrics');
  });
});
