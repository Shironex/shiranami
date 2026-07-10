import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseLrc, buildSearchQueries, fetchLyrics, type LyricsResult } from './lyrics-service';

const loadLocalLyricsMock = vi.fn();
vi.mock('./local-lyrics', () => ({
  loadLocalLyrics: (...args: unknown[]) => loadLocalLyricsMock(...args),
}));

const readEmbeddedLyricsMock = vi.fn();
vi.mock('./embedded-lyrics', () => ({
  readEmbeddedLyrics: (...args: unknown[]) => readEmbeddedLyricsMock(...args),
}));

const storeGetMock = vi.fn();
vi.mock('../app/store', () => ({
  store: { get: (...args: unknown[]) => storeGetMock(...args) },
}));

const isPathAllowedMock = vi.fn();
vi.mock('../shared/folders-cache', () => ({
  isPathAllowed: (...args: unknown[]) => isPathAllowedMock(...args),
}));

const findLyricsMock = vi.fn();
const searchLyricsMock = vi.fn();
vi.mock('lrclib-api', () => ({
  Client: class {
    findLyrics = (...args: unknown[]) => findLyricsMock(...args);
    searchLyrics = (...args: unknown[]) => searchLyricsMock(...args);
  },
}));

vi.mock('../app/http', () => ({
  getLrclibGate: () => ({ run: <T>(fn: () => Promise<T>) => fn() }),
}));

vi.mock('../app/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('parseLrc', () => {
  it('parses standard [mm:ss.xx] lines', () => {
    const lrc = '[01:23.45]Hello world\n[02:34.56]Second line';
    const result = parseLrc(lrc);
    expect(result).toEqual([
      { time: 83.45, text: 'Hello world' },
      { time: 154.56, text: 'Second line' },
    ]);
  });

  it('parses 3-digit milliseconds', () => {
    const lrc = '[00:05.123]Three digit ms';
    const result = parseLrc(lrc);
    expect(result).toEqual([{ time: 5.123, text: 'Three digit ms' }]);
  });

  it('returns empty array for empty input', () => {
    expect(parseLrc('')).toEqual([]);
  });

  it('skips malformed lines', () => {
    const lrc = 'not a lyric\n[01:00.00]Valid line\n[bad]Also bad';
    const result = parseLrc(lrc);
    expect(result).toEqual([{ time: 60, text: 'Valid line' }]);
  });

  it('sorts lines by time', () => {
    const lrc = '[02:00.00]Second\n[01:00.00]First\n[03:00.00]Third';
    const result = parseLrc(lrc);
    expect(result.map(l => l.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('skips lines with empty text', () => {
    const lrc = '[01:00.00]   \n[02:00.00]Has text';
    const result = parseLrc(lrc);
    expect(result).toEqual([{ time: 120, text: 'Has text' }]);
  });

  it('emits one entry per timestamp on multi-timestamp lines, sorted by time', () => {
    const lrc = '[02:03.04][01:02.03]Repeated line';
    const result = parseLrc(lrc);
    expect(result).toEqual([
      { time: 62.03, text: 'Repeated line' },
      { time: 123.04, text: 'Repeated line' },
    ]);
  });

  it('accepts a colon as the millisecond separator', () => {
    const lrc = '[00:05:12]Colon separator';
    const result = parseLrc(lrc);
    expect(result).toEqual([{ time: 5.12, text: 'Colon separator' }]);
  });
});

describe('buildSearchQueries', () => {
  it('returns title+artist as first query', () => {
    const queries = buildSearchQueries('Song', 'Artist');
    expect(queries[0]).toBe('Song Artist');
  });

  it('includes title alone as second query', () => {
    const queries = buildSearchQueries('Song', 'Artist');
    expect(queries).toContain('Song');
  });

  it('splits title containing " - "', () => {
    const queries = buildSearchQueries('Artist - Song', 'Other');
    expect(queries).toContain('Artist Song');
    expect(queries).toContain('Song Artist');
  });

  it('deduplicates queries', () => {
    const queries = buildSearchQueries('Song', 'Song');
    const lower = queries.map(q => q.toLowerCase());
    const unique = new Set(lower);
    expect(lower.length).toBe(unique.size);
  });

  it('handles en-dash separator', () => {
    const queries = buildSearchQueries('Artist \u2013 Song', 'Other');
    expect(queries).toContain('Artist Song');
    expect(queries).toContain('Song Artist');
  });
});

describe('fetchLyrics precedence', () => {
  const LOCAL_SYNCED: LyricsResult = {
    synced: [{ time: 1, text: 'local synced' }],
    plain: null,
    source: 'local-lrc',
  };
  const LOCAL_PLAIN: LyricsResult = { synced: null, plain: 'local plain', source: 'local-txt' };
  const EMBEDDED_SYNCED: LyricsResult = {
    synced: [{ time: 2, text: 'embedded synced' }],
    plain: null,
    source: 'embedded',
  };
  const EMBEDDED_PLAIN: LyricsResult = {
    synced: null,
    plain: 'embedded plain',
    source: 'embedded',
  };

  // Module-level LRU persists across tests \u2014 every test uses a unique
  // title/artist pair so no test reads another's cached network result.
  let n = 0;
  function track(): { title: string; artist: string; filePath: string } {
    n += 1;
    return { title: `Song ${n}`, artist: `Artist ${n}`, filePath: `/music/song-${n}.mp3` };
  }

  beforeEach(() => {
    loadLocalLyricsMock.mockReset().mockResolvedValue(null);
    readEmbeddedLyricsMock.mockReset().mockResolvedValue(null);
    findLyricsMock.mockReset().mockResolvedValue(null);
    searchLyricsMock.mockReset().mockResolvedValue([]);
    storeGetMock.mockReset().mockReturnValue(undefined); // preferSynced OFF (default)
    isPathAllowedMock.mockReset().mockResolvedValue(true); // path inside the library
  });

  it('local synced wins and skips embedded parse + network entirely', async () => {
    const { title, artist, filePath } = track();
    loadLocalLyricsMock.mockResolvedValue(LOCAL_SYNCED);

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result).toEqual(LOCAL_SYNCED);
    expect(readEmbeddedLyricsMock).not.toHaveBeenCalled();
    expect(findLyricsMock).not.toHaveBeenCalled();
    expect(searchLyricsMock).not.toHaveBeenCalled();
  });

  it('embedded synced beats everything but a local synced file, without network', async () => {
    const { title, artist, filePath } = track();
    loadLocalLyricsMock.mockResolvedValue(LOCAL_PLAIN);
    readEmbeddedLyricsMock.mockResolvedValue(EMBEDDED_SYNCED);

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result).toEqual(EMBEDDED_SYNCED);
    expect(findLyricsMock).not.toHaveBeenCalled();
  });

  it('default OFF: local plain suppresses the network call', async () => {
    const { title, artist, filePath } = track();
    loadLocalLyricsMock.mockResolvedValue(LOCAL_PLAIN);

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result).toEqual(LOCAL_PLAIN);
    expect(findLyricsMock).not.toHaveBeenCalled();
    expect(searchLyricsMock).not.toHaveBeenCalled();
  });

  it('default OFF: embedded plain suppresses the network call when no local file', async () => {
    const { title, artist, filePath } = track();
    readEmbeddedLyricsMock.mockResolvedValue(EMBEDDED_PLAIN);

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result).toEqual(EMBEDDED_PLAIN);
    expect(findLyricsMock).not.toHaveBeenCalled();
  });

  it('default OFF: local plain beats embedded plain', async () => {
    const { title, artist, filePath } = track();
    loadLocalLyricsMock.mockResolvedValue(LOCAL_PLAIN);
    readEmbeddedLyricsMock.mockResolvedValue(EMBEDDED_PLAIN);

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result).toEqual(LOCAL_PLAIN);
  });

  it('falls through to LRCLIB when nothing local exists', async () => {
    const { title, artist, filePath } = track();
    findLyricsMock.mockResolvedValue({ syncedLyrics: '[00:01.00]net line', plainLyrics: null });

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result.source).toBe('lrclib');
    expect(result.synced).toEqual([{ time: 1, text: 'net line' }]);
  });

  it('preferSynced ON: LRCLIB synced outranks local plain', async () => {
    const { title, artist, filePath } = track();
    storeGetMock.mockReturnValue(true);
    loadLocalLyricsMock.mockResolvedValue(LOCAL_PLAIN);
    findLyricsMock.mockResolvedValue({ syncedLyrics: '[00:01.00]net line', plainLyrics: null });

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result.source).toBe('lrclib');
  });

  it('preferSynced ON: local plain wins when LRCLIB has nothing', async () => {
    const { title, artist, filePath } = track();
    storeGetMock.mockReturnValue(true);
    loadLocalLyricsMock.mockResolvedValue(LOCAL_PLAIN);

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result).toEqual(LOCAL_PLAIN);
    expect(findLyricsMock).toHaveBeenCalledTimes(1);
  });

  it('preferSynced ON: local plain wins over LRCLIB plain-only', async () => {
    const { title, artist, filePath } = track();
    storeGetMock.mockReturnValue(true);
    loadLocalLyricsMock.mockResolvedValue(LOCAL_PLAIN);
    findLyricsMock.mockResolvedValue({ syncedLyrics: null, plainLyrics: 'net plain' });

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result).toEqual(LOCAL_PLAIN);
  });

  it('without filePath, resolves via LRCLIB only (legacy behavior)', async () => {
    const { title, artist } = track();
    findLyricsMock.mockResolvedValue({ syncedLyrics: null, plainLyrics: 'net plain' });

    const result = await fetchLyrics(title, artist);

    expect(result.source).toBe('lrclib');
    expect(loadLocalLyricsMock).not.toHaveBeenCalled();
    expect(readEmbeddedLyricsMock).not.toHaveBeenCalled();
  });

  it('caches LRCLIB results but re-checks local sources on every call', async () => {
    const { title, artist, filePath } = track();
    findLyricsMock.mockResolvedValue({ syncedLyrics: null, plainLyrics: 'net plain' });

    await fetchLyrics(title, artist, undefined, undefined, filePath);
    expect(findLyricsMock).toHaveBeenCalledTimes(1);
    expect(loadLocalLyricsMock).toHaveBeenCalledTimes(1);

    // Second call: network served from cache, disk re-checked.
    const second = await fetchLyrics(title, artist, undefined, undefined, filePath);
    expect(second.source).toBe('lrclib');
    expect(findLyricsMock).toHaveBeenCalledTimes(1);
    expect(loadLocalLyricsMock).toHaveBeenCalledTimes(2);

    // A lyric file added mid-session wins immediately despite the cache.
    loadLocalLyricsMock.mockResolvedValue(LOCAL_SYNCED);
    const third = await fetchLyrics(title, artist, undefined, undefined, filePath);
    expect(third).toEqual(LOCAL_SYNCED);
  });

  it('returns the empty result when no source has lyrics', async () => {
    const { title, artist, filePath } = track();

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result).toEqual({ synced: null, plain: null, source: null });
  });

  it('a local resolver crash degrades to the network path instead of failing', async () => {
    const { title, artist, filePath } = track();
    loadLocalLyricsMock.mockRejectedValue(new Error('disk error'));
    readEmbeddedLyricsMock.mockRejectedValue(new Error('parse error'));
    findLyricsMock.mockResolvedValue({ syncedLyrics: null, plainLyrics: 'net plain' });

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(result.source).toBe('lrclib');
  });

  it('denies local resolution for paths outside the library (containment gate)', async () => {
    const { title, artist } = track();
    isPathAllowedMock.mockResolvedValue(false);
    loadLocalLyricsMock.mockResolvedValue(LOCAL_SYNCED); // would win if reachable
    findLyricsMock.mockResolvedValue({ syncedLyrics: null, plainLyrics: 'net plain' });

    const result = await fetchLyrics(title, artist, undefined, undefined, '/etc/anything.mp3');

    expect(loadLocalLyricsMock).not.toHaveBeenCalled();
    expect(readEmbeddedLyricsMock).not.toHaveBeenCalled();
    expect(result.source).toBe('lrclib');
  });

  it('an isPathAllowed crash fails closed and degrades to the network path', async () => {
    const { title, artist, filePath } = track();
    isPathAllowedMock.mockRejectedValue(new Error('db down'));
    findLyricsMock.mockResolvedValue({ syncedLyrics: null, plainLyrics: 'net plain' });

    const result = await fetchLyrics(title, artist, undefined, undefined, filePath);

    expect(loadLocalLyricsMock).not.toHaveBeenCalled();
    expect(result.source).toBe('lrclib');
  });

  it('concurrent fetches for the same track share one in-flight LRCLIB request', async () => {
    const { title, artist, filePath } = track();
    let resolveFind: (value: unknown) => void = () => {};
    findLyricsMock.mockReturnValue(new Promise(resolve => (resolveFind = resolve)));

    const first = fetchLyrics(title, artist, undefined, undefined, filePath);
    const second = fetchLyrics(title, artist, undefined, undefined, filePath);
    // Let both calls reach the network step before the fetch resolves.
    await new Promise(resolve => setTimeout(resolve, 0));
    resolveFind({ syncedLyrics: null, plainLyrics: 'net plain' });

    const [a, b] = await Promise.all([first, second]);
    expect(findLyricsMock).toHaveBeenCalledTimes(1);
    expect(a.source).toBe('lrclib');
    expect(b.source).toBe('lrclib');
  });
});
