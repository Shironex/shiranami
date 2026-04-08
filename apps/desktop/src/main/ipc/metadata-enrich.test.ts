import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ipcHandlers,
  createMainWindowMock,
  asBrowserWindow,
  type MainWindowMock,
} from '../../../test/setup';
import {
  registerMetadataEnrichHandlers,
  cleanupMetadataEnrichHandlers,
  type EnrichTrackInput,
  type EnrichTrackResult,
} from './metadata-enrich';
import type { MetadataLookupResult } from '../metadata-lookup';

vi.mock('../metadata-lookup', () => ({
  lookupMetadata: vi.fn(),
  downloadImage: vi.fn(),
}));

vi.mock('../metadata-writer', () => ({
  writeMetadataToFile: vi.fn(async () => null),
}));

vi.mock('../art-protocol', () => ({
  saveAlbumArt: vi.fn(async () => 'shiranami-art://hash'),
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import mocked modules so we can configure return values per test
import { lookupMetadata, downloadImage } from '../metadata-lookup';
import { writeMetadataToFile } from '../metadata-writer';
import { saveAlbumArt } from '../art-protocol';

const mockedLookup = vi.mocked(lookupMetadata);
const mockedDownloadImage = vi.mocked(downloadImage);
const mockedWriteMetadata = vi.mocked(writeMetadataToFile);
const mockedSaveAlbumArt = vi.mocked(saveAlbumArt);

function makeTrack(overrides: Partial<EnrichTrackInput> = {}): EnrichTrackInput {
  return {
    id: 'track-1',
    filePath: '/music/song.mp3',
    title: 'My Song',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    albumArt: null,
    genre: '',
    year: null,
    trackNumber: null,
    ...overrides,
  };
}

function makeLookupResult(overrides: Partial<MetadataLookupResult> = {}): MetadataLookupResult {
  return {
    title: 'My Song',
    artist: 'Found Artist',
    album: 'Found Album',
    genre: 'Pop',
    year: 2024,
    trackNumber: 3,
    coverImageUrl: 'https://example.com/cover.jpg',
    source: 'itunes',
    confidence: 0.9,
    ...overrides,
  };
}

describe('metadata-enrich handlers', () => {
  let win: MainWindowMock;

  beforeEach(() => {
    ipcHandlers.clear();
    vi.clearAllMocks();

    win = createMainWindowMock();
    (win as unknown as { isDestroyed: ReturnType<typeof vi.fn> }).isDestroyed = vi.fn().mockReturnValue(false);
    registerMetadataEnrichHandlers(asBrowserWindow(win));
  });

  afterEach(() => {
    cleanupMetadataEnrichHandlers();
  });

  // ---------------------------------------------------------------
  // metadata:lookup
  // ---------------------------------------------------------------
  describe('metadata:lookup', () => {
    it('delegates to lookupMetadata and returns the result', async () => {
      const expected = makeLookupResult();
      mockedLookup.mockResolvedValue(expected);

      const handler = ipcHandlers.get('metadata:lookup')!;
      const result = await handler(null as never, 'My Song', 'Unknown Artist');

      expect(mockedLookup).toHaveBeenCalledWith('My Song', 'Unknown Artist');
      expect(result).toBe(expected);
    });
  });

  // ---------------------------------------------------------------
  // metadata:enrich-tracks — onlyMissing: true
  // ---------------------------------------------------------------
  describe('metadata:enrich-tracks with onlyMissing: true', () => {
    it('only fills fields that are missing/default, leaves existing values untouched', async () => {
      const track = makeTrack({
        artist: 'Existing Artist', // already has artist — should NOT be overwritten
        album: 'Unknown Album',    // default — should be overwritten
        genre: 'Rock',             // already has genre — should NOT be overwritten
        year: null,                // missing — should be filled
        trackNumber: 5,            // already has value — should NOT be overwritten
        albumArt: 'existing-art',  // already has art — cover download should be skipped
      });

      mockedLookup.mockResolvedValue(makeLookupResult());

      const handler = ipcHandlers.get('metadata:enrich-tracks')!;
      const results = await handler(null as never, [track], {
        writeToFile: false,
        onlyMissing: true,
      }) as EnrichTrackResult[];

      expect(results).toHaveLength(1);
      const r = results[0];
      expect(r.success).toBe(true);
      expect(r.source).toBe('itunes');

      // Should be updated (were missing/default)
      expect(r.updatedFields.album).toBe('Found Album');
      expect(r.updatedFields.year).toBe(2024);

      // Should NOT be updated (had existing values)
      expect(r.updatedFields.artist).toBeUndefined();
      expect(r.updatedFields.genre).toBeUndefined();
      expect(r.updatedFields.trackNumber).toBeUndefined();

      // Cover download should not have been attempted since albumArt already exists
      expect(mockedDownloadImage).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // metadata:enrich-tracks — onlyMissing: false
  // ---------------------------------------------------------------
  describe('metadata:enrich-tracks with onlyMissing: false', () => {
    it('overwrites all fields with lookup data', async () => {
      const track = makeTrack({
        artist: 'Existing Artist',
        album: 'Existing Album',
        genre: 'Rock',
        year: 2000,
        trackNumber: 1,
        albumArt: 'existing-art',
      });

      mockedLookup.mockResolvedValue(makeLookupResult());
      mockedDownloadImage.mockResolvedValue(Buffer.from('fake-image'));

      const handler = ipcHandlers.get('metadata:enrich-tracks')!;
      const results = await handler(null as never, [track], {
        writeToFile: false,
        onlyMissing: false,
      }) as EnrichTrackResult[];

      expect(results).toHaveLength(1);
      const r = results[0];
      expect(r.success).toBe(true);

      // All fields should be overwritten
      expect(r.updatedFields.artist).toBe('Found Artist');
      expect(r.updatedFields.album).toBe('Found Album');
      expect(r.updatedFields.genre).toBe('Pop');
      expect(r.updatedFields.year).toBe(2024);
      expect(r.updatedFields.trackNumber).toBe(3);

      // Cover art should be downloaded and saved to cache
      expect(mockedDownloadImage).toHaveBeenCalledWith('https://example.com/cover.jpg');
      expect(mockedSaveAlbumArt).toHaveBeenCalled();
      expect(r.updatedFields.albumArt).toBe('shiranami-art://hash');
    });
  });

  // ---------------------------------------------------------------
  // metadata:enrich-cancel
  // ---------------------------------------------------------------
  describe('metadata:enrich-cancel', () => {
    it('cancels in-progress enrichment', async () => {
      vi.useFakeTimers();

      const tracks = [
        makeTrack({ id: 'track-1', title: 'Song 1' }),
        makeTrack({ id: 'track-2', title: 'Song 2' }),
        makeTrack({ id: 'track-3', title: 'Song 3' }),
      ];

      mockedLookup.mockResolvedValue(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich-tracks')!;

      // Start enrichment (don't await yet — it will block on the inter-track delay)
      const enrichPromise = handler(null as never, tracks, {
        writeToFile: false,
        onlyMissing: false,
      }) as Promise<EnrichTrackResult[]>;

      // Let microtasks settle so the first track processes
      await vi.advanceTimersByTimeAsync(0);

      // Cancel after first track
      const cancelHandler = ipcHandlers.get('metadata:enrich-cancel')!;
      await cancelHandler(null as never);

      // Advance past the inter-track delay so the loop continues and hits the cancel check
      await vi.advanceTimersByTimeAsync(1000);

      const results = await enrichPromise;

      // Should have processed track 1, then cancelled before track 3
      expect(results.length).toBeLessThan(tracks.length);
      expect(results[0].id).toBe('track-1');
      expect(results[0].success).toBe(true);

      // Should have sent a 'cancelled' progress event
      const progressCalls = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich-progress'
      );
      const cancelledProgress = progressCalls.find(
        (c: unknown[]) => (c[1] as { status: string }).status === 'cancelled'
      );
      expect(cancelledProgress).toBeDefined();

      vi.useRealTimers();
    });
  });

  // ---------------------------------------------------------------
  // Track with no metadata match (source: 'none')
  // ---------------------------------------------------------------
  describe('no metadata match', () => {
    it('returns success:false with source "none" for unmatched track', async () => {
      mockedLookup.mockResolvedValue({
        source: 'none',
        confidence: 0,
      });

      const handler = ipcHandlers.get('metadata:enrich-tracks')!;
      const results = await handler(null as never, [makeTrack()], {
        writeToFile: false,
        onlyMissing: false,
      }) as EnrichTrackResult[];

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].source).toBe('none');
      expect(results[0].error).toBe('No metadata found');
      expect(results[0].updatedFields).toEqual({});
    });
  });

  // ---------------------------------------------------------------
  // Cover art download failure is caught gracefully
  // ---------------------------------------------------------------
  describe('cover art download failure', () => {
    it('still succeeds for text fields when cover art download fails', async () => {
      mockedLookup.mockResolvedValue(makeLookupResult());
      mockedDownloadImage.mockRejectedValue(new Error('Network error'));

      const handler = ipcHandlers.get('metadata:enrich-tracks')!;
      const results = await handler(null as never, [makeTrack()], {
        writeToFile: false,
        onlyMissing: false,
      }) as EnrichTrackResult[];

      expect(results).toHaveLength(1);
      const r = results[0];
      expect(r.success).toBe(true);
      expect(r.source).toBe('itunes');

      // Text fields should still be populated
      expect(r.updatedFields.artist).toBe('Found Artist');
      expect(r.updatedFields.album).toBe('Found Album');
      expect(r.updatedFields.genre).toBe('Pop');

      // Album art should NOT be set since download failed
      expect(r.updatedFields.albumArt).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // Progress events
  // ---------------------------------------------------------------
  describe('progress events', () => {
    it('sends progress events to the window for each track', async () => {
      vi.useFakeTimers();

      const tracks = [
        makeTrack({ id: 'track-1', title: 'Song 1' }),
        makeTrack({ id: 'track-2', title: 'Song 2' }),
      ];

      mockedLookup.mockResolvedValue(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich-tracks')!;
      const resultPromise = handler(null as never, tracks, {
        writeToFile: false,
        onlyMissing: false,
      });

      // Advance past the inter-track delay so both tracks are processed
      await vi.advanceTimersByTimeAsync(2000);
      await resultPromise;

      const progressCalls = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich-progress'
      );

      // Each track gets at least 'searching' and 'done' progress events
      expect(progressCalls.length).toBeGreaterThanOrEqual(4);

      // Verify structure of first progress event
      const firstProgress = progressCalls[0][1] as {
        current: number;
        total: number;
        trackName: string;
        status: string;
      };
      expect(firstProgress).toEqual({
        current: 1,
        total: 2,
        trackName: 'Song 1',
        status: 'searching',
      });

      // Verify there's a 'done' event for each track
      const doneEvents = progressCalls.filter(
        (c: unknown[]) => (c[1] as { status: string }).status === 'done'
      );
      expect(doneEvents).toHaveLength(2);

      vi.useRealTimers();
    });

    it('does not send progress if window is destroyed', async () => {
      (win as unknown as { isDestroyed: ReturnType<typeof vi.fn> }).isDestroyed.mockReturnValue(true);

      mockedLookup.mockResolvedValue(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich-tracks')!;
      await handler(null as never, [makeTrack()], {
        writeToFile: false,
        onlyMissing: false,
      });

      expect(win.webContents.send).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // writeToFile mode
  // ---------------------------------------------------------------
  describe('writeToFile: true', () => {
    it('calls writeMetadataToFile with updated fields and cover buffer', async () => {
      mockedLookup.mockResolvedValue(makeLookupResult());
      mockedDownloadImage.mockResolvedValue(Buffer.from('image-data'));
      mockedWriteMetadata.mockResolvedValue('shiranami-art://written');

      const track = makeTrack();
      const handler = ipcHandlers.get('metadata:enrich-tracks')!;
      const results = await handler(null as never, [track], {
        writeToFile: true,
        onlyMissing: false,
      }) as EnrichTrackResult[];

      expect(mockedWriteMetadata).toHaveBeenCalledWith(
        '/music/song.mp3',
        expect.objectContaining({
          artist: 'Found Artist',
          album: 'Found Album',
          genre: 'Pop',
          year: 2024,
          trackNumber: 3,
          coverImageBuffer: expect.any(Buffer),
          coverImageMime: 'image/jpeg',
        })
      );

      expect(results[0].updatedFields.albumArt).toBe('shiranami-art://written');
    });
  });

  // ---------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------
  describe('cleanupMetadataEnrichHandlers', () => {
    it('removes all registered handlers', () => {
      expect(ipcHandlers.has('metadata:lookup')).toBe(true);
      expect(ipcHandlers.has('metadata:enrich-cancel')).toBe(true);
      expect(ipcHandlers.has('metadata:enrich-tracks')).toBe(true);

      cleanupMetadataEnrichHandlers();

      expect(ipcHandlers.has('metadata:lookup')).toBe(false);
      expect(ipcHandlers.has('metadata:enrich-cancel')).toBe(false);
      expect(ipcHandlers.has('metadata:enrich-tracks')).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // Error handling per-track
  // ---------------------------------------------------------------
  describe('per-track error handling', () => {
    it('catches errors per track and continues processing remaining tracks', async () => {
      vi.useFakeTimers();

      const tracks = [
        makeTrack({ id: 'track-1', title: 'Failing Song' }),
        makeTrack({ id: 'track-2', title: 'Good Song' }),
      ];

      mockedLookup
        .mockRejectedValueOnce(new Error('API timeout'))
        .mockResolvedValueOnce(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich-tracks')!;
      const resultPromise = handler(null as never, tracks, {
        writeToFile: false,
        onlyMissing: false,
      });

      await vi.advanceTimersByTimeAsync(2000);
      const results = await resultPromise as EnrichTrackResult[];

      expect(results).toHaveLength(2);

      // First track failed
      expect(results[0].id).toBe('track-1');
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('API timeout');
      expect(results[0].source).toBe('none');

      // Second track succeeded
      expect(results[1].id).toBe('track-2');
      expect(results[1].success).toBe(true);
      expect(results[1].source).toBe('itunes');

      // Error progress event was sent for first track
      const progressCalls = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich-progress'
      );
      const errorEvent = progressCalls.find(
        (c: unknown[]) => (c[1] as { status: string }).status === 'error'
      );
      expect(errorEvent).toBeDefined();

      vi.useRealTimers();
    });
  });
});
