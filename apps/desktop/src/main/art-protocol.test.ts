import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { closeDatabase, initializeDatabase, getDatabase } from '@shiranami/database/client';
import { tracks, playlists } from '@shiranami/database';
import { makeTempDir, cleanupTempDir } from '../../test/setup';
import { extToMime, toArtUrl } from './art-protocol';

describe('extToMime', () => {
  it('maps .jpg to image/jpeg', () => {
    expect(extToMime('.jpg')).toBe('image/jpeg');
  });

  it('maps .jpeg to image/jpeg', () => {
    expect(extToMime('.jpeg')).toBe('image/jpeg');
  });

  it('maps .png to image/png', () => {
    expect(extToMime('.png')).toBe('image/png');
  });

  it('maps .webp to image/webp', () => {
    expect(extToMime('.webp')).toBe('image/webp');
  });

  it('maps .gif to image/gif', () => {
    expect(extToMime('.gif')).toBe('image/gif');
  });

  it('maps .bmp to image/bmp', () => {
    expect(extToMime('.bmp')).toBe('image/bmp');
  });

  it('falls back to image/jpeg for unknown extensions', () => {
    expect(extToMime('.tiff')).toBe('image/jpeg');
    expect(extToMime('.svg')).toBe('image/jpeg');
  });
});

describe('toArtUrl', () => {
  it('returns correct protocol URL', () => {
    expect(toArtUrl('abc123.jpg')).toBe('shiranami-art://art/abc123.jpg');
  });

  it('preserves filename with extension', () => {
    expect(toArtUrl('deadbeef.png')).toBe('shiranami-art://art/deadbeef.png');
  });
});

// ---------------------------------------------------------------------------
// downscaleImage — takes a NativeImage; each test builds a stub directly.
// ---------------------------------------------------------------------------

function makeImageStub({
  width = 1000,
  height = 1000,
  jpegOutput = Buffer.from('jpeg-output'),
}: {
  width?: number;
  height?: number;
  jpegOutput?: Buffer;
} = {}) {
  const resizedStub = {
    toJPEG: vi.fn().mockReturnValue(jpegOutput),
  };
  const stub = {
    isEmpty: vi.fn().mockReturnValue(false),
    getSize: vi.fn().mockReturnValue({ width, height }),
    resize: vi.fn().mockReturnValue(resizedStub),
    toJPEG: vi.fn().mockReturnValue(jpegOutput),
  };
  return { stub, resizedStub };
}

describe('downscaleImage', () => {
  it('re-encodes to JPEG q=85 without resize when dimensions are within limit', async () => {
    const jpeg = Buffer.from('small-jpeg');
    const { stub } = makeImageStub({ width: 256, height: 256, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).not.toHaveBeenCalled();
    expect(stub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });

  it('resizes wide image so longest edge becomes 512', async () => {
    const jpeg = Buffer.from('resized-wide');
    const { stub, resizedStub } = makeImageStub({ width: 1024, height: 512, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).toHaveBeenCalledWith({ width: 512, height: 256, quality: 'best' });
    expect(resizedStub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });

  it('resizes tall image so longest edge becomes 512', async () => {
    const jpeg = Buffer.from('resized-tall');
    const { stub, resizedStub } = makeImageStub({ width: 400, height: 800, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).toHaveBeenCalledWith({ width: 256, height: 512, quality: 'best' });
    expect(resizedStub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });

  it('resizes square image so both edges become 512', async () => {
    const jpeg = Buffer.from('resized-square');
    const { stub, resizedStub } = makeImageStub({ width: 1000, height: 1000, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).toHaveBeenCalledWith({ width: 512, height: 512, quality: 'best' });
    expect(resizedStub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });

  it('floors target dimension at 1px for extreme aspect ratios', async () => {
    const jpeg = Buffer.from('resized-extreme');
    const { stub, resizedStub } = makeImageStub({ width: 10000, height: 1, jpegOutput: jpeg });

    const { downscaleImage } = await import('./art-protocol');
    const result = downscaleImage(stub as never);

    expect(stub.resize).toHaveBeenCalledWith({ width: 512, height: 1, quality: 'best' });
    expect(resizedStub.toJPEG).toHaveBeenCalledWith(85);
    expect(result).toBe(jpeg);
  });
});

// ---------------------------------------------------------------------------
// saveAlbumArt — mocks nativeImage via vi.mock (module-level).
// ---------------------------------------------------------------------------

// Per-test artDir is computed by getArtDir() which calls app.getPath('userData')
// on first invocation and memoizes the result. Tests that exercise prune set
// MOCK_USER_DATA before importing the module; saveAlbumArt tests rely on the
// nativeImage stub and don't reach the disk.
let MOCK_USER_DATA = '/mock/userData';

/** Captured protocol handler for the streaming-handler tests. */
let capturedArtHandler: ((req: Request) => Promise<Response>) | null = null;

vi.mock('electron', async importOriginal => {
  const original = await importOriginal<typeof import('electron')>();
  return {
    ...original,
    app: {
      getPath: vi.fn((key: string) => {
        if (key === 'userData') return MOCK_USER_DATA;
        return '/mock/unknown';
      }),
    },
    protocol: {
      handle(_scheme: string, handler: (req: Request) => Promise<Response>) {
        capturedArtHandler = handler;
      },
    },
    nativeImage: {
      createFromBuffer: vi.fn(),
    },
  };
});

vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('saveAlbumArt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns null for empty buffer', async () => {
    const { saveAlbumArt } = await import('./art-protocol');
    expect(await saveAlbumArt(Buffer.alloc(0), 'image/jpeg')).toBeNull();
  });

  it('returns null when nativeImage cannot decode the buffer', async () => {
    const { nativeImage } = await import('electron');
    const emptyStub = { isEmpty: vi.fn().mockReturnValue(true) };
    vi.mocked(nativeImage.createFromBuffer).mockReturnValue(emptyStub as never);

    const { saveAlbumArt } = await import('./art-protocol');
    expect(await saveAlbumArt(Buffer.from('garbage'), 'image/jpeg')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// artFileNameFromUrl — pure helper, no I/O.
// ---------------------------------------------------------------------------

describe('artFileNameFromUrl', () => {
  it('extracts the file name from a shiranami-art:// URL', async () => {
    const { artFileNameFromUrl } = await import('./art-protocol');
    expect(artFileNameFromUrl('shiranami-art://art/abc123.jpg')).toBe('abc123.jpg');
  });

  it('returns null for non-shiranami-art URLs', async () => {
    const { artFileNameFromUrl } = await import('./art-protocol');
    expect(artFileNameFromUrl('data:image/jpeg;base64,xyz')).toBeNull();
    expect(artFileNameFromUrl('https://example.com/cover.jpg')).toBeNull();
    expect(artFileNameFromUrl('file:///C:/cover.jpg')).toBeNull();
  });

  it('returns null for nullish input', async () => {
    const { artFileNameFromUrl } = await import('./art-protocol');
    expect(artFileNameFromUrl(null)).toBeNull();
    expect(artFileNameFromUrl(undefined)).toBeNull();
    expect(artFileNameFromUrl('')).toBeNull();
  });

  it('rejects path traversal attempts via basename', async () => {
    const { artFileNameFromUrl } = await import('./art-protocol');
    // basename strips directory components; the result is just the file name.
    expect(artFileNameFromUrl('shiranami-art://art/../../etc/passwd')).toBe('passwd');
  });
});

// ---------------------------------------------------------------------------
// pruneOrphanedAlbumArt — uses real DB + temp art dir.
// ---------------------------------------------------------------------------

describe('pruneOrphanedAlbumArt', () => {
  let tempDir: string;
  let artDir: string;

  beforeEach(async () => {
    closeDatabase();
    tempDir = makeTempDir();
    MOCK_USER_DATA = tempDir;
    artDir = join(tempDir, 'album-art');
    fs.mkdirSync(artDir, { recursive: true });
    initializeDatabase({ path: join(tempDir, 'prune-test.sqlite') });
    // Drop the module-scoped memoized artDir so it re-evaluates against the
    // freshly-mocked MOCK_USER_DATA. Also clears the in-process LRU so cached
    // entries from prior tests can't leak across cases.
    const mod = await import('./art-protocol');
    mod._resetArtDirForTest();
    mod._resetArtLruForTest();
  });

  afterEach(() => {
    closeDatabase();
    cleanupTempDir(tempDir);
  });

  function writeArtFile(name: string): string {
    const filePath = join(artDir, name);
    fs.writeFileSync(filePath, Buffer.from('fake-jpeg-bytes'));
    return filePath;
  }

  function insertTrack(id: string, albumArt: string | null): void {
    getDatabase()
      .insert(tracks)
      .values({
        id,
        title: 'Test',
        artist: 'Artist',
        album: 'Album',
        filePath: `/mock/${id}.flac`,
        duration: 100,
        albumArt,
      })
      .run();
  }

  function insertPlaylist(id: string, coverArt: string | null): void {
    getDatabase()
      .insert(playlists)
      .values({ id, name: `Playlist ${id}`, coverArt })
      .run();
  }

  it('does nothing when the disk is empty', async () => {
    const { pruneOrphanedAlbumArt } = await import('./art-protocol');
    const result = await pruneOrphanedAlbumArt();
    expect(result.deleted).toBe(0);
    expect(result.scanned).toBe(0);
  });

  it('keeps every file when all are referenced by the DB', async () => {
    writeArtFile('aaa.jpg');
    writeArtFile('bbb.jpg');
    insertTrack('t1', 'shiranami-art://art/aaa.jpg');
    insertTrack('t2', 'shiranami-art://art/bbb.jpg');

    const { pruneOrphanedAlbumArt } = await import('./art-protocol');
    const result = await pruneOrphanedAlbumArt();

    expect(result.deleted).toBe(0);
    expect(result.scanned).toBe(2);
    expect(result.referenced).toBe(2);
    expect(fs.existsSync(join(artDir, 'aaa.jpg'))).toBe(true);
    expect(fs.existsSync(join(artDir, 'bbb.jpg'))).toBe(true);
  });

  it('deletes only orphan files, leaving referenced ones', async () => {
    writeArtFile('referenced.jpg');
    writeArtFile('orphan-1.jpg');
    writeArtFile('orphan-2.jpg');
    insertTrack('t1', 'shiranami-art://art/referenced.jpg');

    const { pruneOrphanedAlbumArt } = await import('./art-protocol');
    const result = await pruneOrphanedAlbumArt();

    expect(result.deleted).toBe(2);
    expect(result.scanned).toBe(3);
    expect(result.referenced).toBe(1);
    expect(fs.existsSync(join(artDir, 'referenced.jpg'))).toBe(true);
    expect(fs.existsSync(join(artDir, 'orphan-1.jpg'))).toBe(false);
    expect(fs.existsSync(join(artDir, 'orphan-2.jpg'))).toBe(false);
  });

  it('keeps a file referenced ONLY by a playlist cover (no track references it)', async () => {
    // "Use suggested cover" copies a track's shiranami-art:// URL into a
    // playlist cover. After the originating track is removed, the file is
    // referenced solely by playlists.cover_art and must survive the prune.
    writeArtFile('playlist-cover.jpg');
    writeArtFile('true-orphan.jpg');
    insertPlaylist('p1', 'shiranami-art://art/playlist-cover.jpg');

    const { pruneOrphanedAlbumArt } = await import('./art-protocol');
    const result = await pruneOrphanedAlbumArt();

    expect(result.referenced).toBe(1);
    expect(result.deleted).toBe(1);
    expect(fs.existsSync(join(artDir, 'playlist-cover.jpg'))).toBe(true);
    expect(fs.existsSync(join(artDir, 'true-orphan.jpg'))).toBe(false);
  });

  it('does not error when DB references a file that does not exist on disk', async () => {
    writeArtFile('on-disk.jpg');
    insertTrack('t1', 'shiranami-art://art/on-disk.jpg');
    insertTrack('t2', 'shiranami-art://art/missing.jpg');

    const { pruneOrphanedAlbumArt } = await import('./art-protocol');
    const result = await pruneOrphanedAlbumArt();

    expect(result.deleted).toBe(0);
    expect(result.referenced).toBe(2);
    expect(fs.existsSync(join(artDir, 'on-disk.jpg'))).toBe(true);
  });

  it('ignores tracks with non-shiranami-art URLs (data:, https:, null)', async () => {
    writeArtFile('orphan.jpg');
    insertTrack('t1', 'data:image/jpeg;base64,xyz');
    insertTrack('t2', 'https://example.com/cover.jpg');
    insertTrack('t3', null);

    const { pruneOrphanedAlbumArt } = await import('./art-protocol');
    const result = await pruneOrphanedAlbumArt();

    // Nothing in the DB references any disk file → orphan should be deleted.
    expect(result.deleted).toBe(1);
    expect(result.referenced).toBe(0);
    expect(fs.existsSync(join(artDir, 'orphan.jpg'))).toBe(false);
  });

  it('skips files with non-image extensions', async () => {
    writeArtFile('cover.jpg');
    fs.writeFileSync(join(artDir, 'random.txt'), 'not-an-image');
    insertTrack('t1', 'shiranami-art://art/cover.jpg');

    const { pruneOrphanedAlbumArt } = await import('./art-protocol');
    const result = await pruneOrphanedAlbumArt();

    expect(result.deleted).toBe(0);
    expect(fs.existsSync(join(artDir, 'random.txt'))).toBe(true);
    expect(fs.existsSync(join(artDir, 'cover.jpg'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Streaming protocol handler — exercises the createReadStream + LRU tee path
// ported from audio-protocol.ts.
// ---------------------------------------------------------------------------

describe('art-protocol streaming handler', () => {
  let tempDir: string;
  let artDir: string;

  beforeEach(async () => {
    capturedArtHandler = null;
    tempDir = makeTempDir();
    MOCK_USER_DATA = tempDir;
    artDir = join(tempDir, 'album-art');
    fs.mkdirSync(artDir, { recursive: true });
    const mod = await import('./art-protocol');
    mod._resetArtDirForTest();
    mod._resetArtLruForTest();
    mod.registerArtProtocol();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  function makeRequest(fileName: string): Request {
    return new Request(toArtUrl(fileName));
  }

  it('returns 400 for empty file name', async () => {
    expect(capturedArtHandler).not.toBeNull();
    const res = await capturedArtHandler!(new Request('shiranami-art://art/'));
    expect(res.status).toBe(400);
  });

  it('returns 403 for disallowed extensions', async () => {
    const res = await capturedArtHandler!(makeRequest('cover.txt'));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the file does not exist on disk', async () => {
    const res = await capturedArtHandler!(makeRequest('missing.jpg'));
    expect(res.status).toBe(404);
  });

  it('streams file bytes for a present art file', async () => {
    const payload = Buffer.from('FAKE_JPEG_BYTES_' + 'x'.repeat(200));
    fs.writeFileSync(join(artDir, 'present.jpg'), payload);

    const res = await capturedArtHandler!(makeRequest('present.jpg'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Content-Length')).toBe(String(payload.length));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(payload)).toBe(true);
  });

  it('populates the LRU after streaming so a second request hits the cache', async () => {
    const payload = Buffer.from('CACHED_JPEG_BYTES');
    fs.writeFileSync(join(artDir, 'hot.jpg'), payload);

    // First request streams from disk and tees into the LRU.
    const first = await capturedArtHandler!(makeRequest('hot.jpg'));
    expect(Buffer.from(await first.arrayBuffer()).equals(payload)).toBe(true);

    // Delete the file — second request must come from the LRU now.
    fs.unlinkSync(join(artDir, 'hot.jpg'));
    const second = await capturedArtHandler!(makeRequest('hot.jpg'));
    expect(second.status).toBe(200);
    expect(Buffer.from(await second.arrayBuffer()).equals(payload)).toBe(true);
  });

  it('rejects path traversal via basename normalisation', async () => {
    // basename strips ../ — the handler then 404s because the file does not
    // exist in the art dir.
    const res = await capturedArtHandler!(
      new Request('shiranami-art://art/..%2F..%2Fetc%2Fpasswd.jpg')
    );
    expect(res.status).toBe(404);
  });
});
