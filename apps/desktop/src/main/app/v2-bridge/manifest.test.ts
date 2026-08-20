import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockLogger, mockApp } = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockApp: { version: '1.0.0' },
}));

vi.mock('../logger', () => ({ logger: mockLogger }));

vi.mock('electron', () => ({
  app: { getVersion: () => mockApp.version },
}));

import {
  __resetManifestLogGate,
  currentPlatformKey,
  fetchV2Manifest,
  meetsMinimumV1Version,
  resolveHandover,
  selectArtifact,
  v2ManifestSchema,
  type V2Manifest,
} from './manifest';
import { MANIFEST_MAX_BYTES } from './constants';

const SHA = 'a'.repeat(64);

function manifestFixture(overrides: Partial<V2Manifest> = {}): V2Manifest {
  return {
    enabled: true,
    version: '2.0.0',
    min_v1_version: '1.0.0',
    platforms: {
      [currentPlatformKey()]: {
        url: 'https://shiranami.app/releases/Shiranami_2.0.0_x64-setup.exe',
        sha256: SHA,
        size: 12_345_678,
      },
    },
    ...overrides,
  };
}

/** Minimal `Response` stand-in — only the fields `fetchV2Manifest` reads. */
function jsonResponse(body: string, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: () => String(body.length) },
    text: async () => body,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  mockApp.version = '1.0.0';
  vi.clearAllMocks();
  __resetManifestLogGate();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchV2Manifest — the dormant path', () => {
  it('returns null when the manifest does not exist (404)', async () => {
    fetchMock.mockResolvedValue(jsonResponse('Not Found', { ok: false, status: 404 }));

    await expect(fetchV2Manifest()).resolves.toBeNull();
  });

  it('returns null on any other non-2xx status', async () => {
    fetchMock.mockResolvedValue(jsonResponse('nope', { ok: false, status: 503 }));

    await expect(fetchV2Manifest()).resolves.toBeNull();
  });

  it('returns null on a network failure instead of throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchV2Manifest()).resolves.toBeNull();
  });

  it('returns null when the request times out', async () => {
    const abortError = new Error('This operation was aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValue(abortError);

    await expect(fetchV2Manifest()).resolves.toBeNull();
  });

  it('returns null when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse('<!doctype html><title>404</title>'));

    await expect(fetchV2Manifest()).resolves.toBeNull();
  });

  it('returns null when the JSON fails schema validation', async () => {
    fetchMock.mockResolvedValue(jsonResponse(JSON.stringify({ enabled: true })));

    await expect(fetchV2Manifest()).resolves.toBeNull();
  });

  it('returns null when a platform entry carries a malformed digest', async () => {
    const bad = manifestFixture();
    bad.platforms[currentPlatformKey()]!.sha256 = 'not-a-digest';
    fetchMock.mockResolvedValue(jsonResponse(JSON.stringify(bad)));

    await expect(fetchV2Manifest()).resolves.toBeNull();
  });

  it('returns null when the body exceeds the size cap', async () => {
    const oversized = ' '.repeat(MANIFEST_MAX_BYTES + 1);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => oversized,
    });

    await expect(fetchV2Manifest()).resolves.toBeNull();
  });

  it('returns null without reading the body when content-length exceeds the cap', async () => {
    const text = vi.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => String(MANIFEST_MAX_BYTES + 1) },
      text,
    });

    await expect(fetchV2Manifest()).resolves.toBeNull();
    expect(text).not.toHaveBeenCalled();
  });

  it('never logs the dormant outcome more than once per process', async () => {
    fetchMock.mockResolvedValue(jsonResponse('Not Found', { ok: false, status: 404 }));

    await fetchV2Manifest();
    await fetchV2Manifest();
    await fetchV2Manifest();

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('requests the manifest with a cache-bypassing GET so the kill switch is prompt', async () => {
    fetchMock.mockResolvedValue(jsonResponse('Not Found', { ok: false, status: 404 }));

    await fetchV2Manifest();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/v2\.json$/);
    expect(url).not.toMatch(/latest\.yml/);
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeDefined();
  });
});

describe('fetchV2Manifest — the active path', () => {
  it('returns the parsed manifest for a well-formed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(JSON.stringify(manifestFixture())));

    const manifest = await fetchV2Manifest();

    expect(manifest).not.toBeNull();
    expect(manifest?.version).toBe('2.0.0');
    expect(manifest?.enabled).toBe(true);
  });

  it('keeps an optional download_page and tolerates unknown platform keys', async () => {
    const fixture = manifestFixture({ download_page: 'https://shiranami.app/download' });
    fixture.platforms['sunos-sparc'] = {
      url: 'https://shiranami.app/nope.exe',
      sha256: 'b'.repeat(64),
      size: 1,
    };
    fetchMock.mockResolvedValue(jsonResponse(JSON.stringify(fixture)));

    const manifest = await fetchV2Manifest();

    expect(manifest?.download_page).toBe('https://shiranami.app/download');
    expect(Object.keys(manifest?.platforms ?? {})).toContain('sunos-sparc');
  });

  it('accepts a prerelease v2 version', () => {
    const parsed = v2ManifestSchema.safeParse(manifestFixture({ version: '2.0.0-rc.1' }));
    expect(parsed.success).toBe(true);
  });
});

describe('resolveHandover', () => {
  it('returns the artifact for this platform when everything lines up', () => {
    expect(resolveHandover(manifestFixture())).not.toBeNull();
  });

  it('returns null when the kill switch is off', () => {
    expect(resolveHandover(manifestFixture({ enabled: false }))).toBeNull();
  });

  it('returns null when this install is below the minimum v1 version', () => {
    mockApp.version = '0.19.0';
    expect(resolveHandover(manifestFixture({ min_v1_version: '1.0.0' }))).toBeNull();
  });

  it('returns null when the manifest has no artifact for this platform', () => {
    expect(resolveHandover(manifestFixture({ platforms: {} }))).toBeNull();
  });
});

describe('meetsMinimumV1Version', () => {
  it.each([
    ['1.0.0', '1.0.0', true],
    ['1.0.1', '1.0.0', true],
    ['1.2.0', '1.0.0', true],
    ['2.0.0', '1.0.0', true],
    ['0.20.3', '1.0.0', false],
    ['1.0.0', '1.0.1', false],
  ])('current %s against floor %s → %s', (current, floor, expected) => {
    expect(meetsMinimumV1Version(manifestFixture({ min_v1_version: floor }), current)).toBe(
      expected
    );
  });
});

describe('selectArtifact', () => {
  it('keys off platform and arch', () => {
    expect(currentPlatformKey()).toBe(`${process.platform}-${process.arch}`);
    expect(selectArtifact(manifestFixture())?.size).toBe(12_345_678);
  });

  it('returns null when the key is absent', () => {
    expect(selectArtifact(manifestFixture({ platforms: {} }))).toBeNull();
  });
});
