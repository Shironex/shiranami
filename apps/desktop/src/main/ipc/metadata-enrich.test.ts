import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ipcHandlers,
  createMainWindowMock,
  asBrowserWindow,
  setMockMainWindow,
  expectIpcErrorCode,
  type MainWindowMock,
} from '../../../test/setup';
import {
  registerMetadataEnrichHandlers,
  cleanupMetadataEnrichHandlers,
  ENRICH_CONCURRENCY,
  type EnrichTrackInput,
  type EnrichTrackResult,
} from './metadata-enrich';
import type { MetadataLookupResult } from '../services/metadata-lookup';

vi.mock('../services/metadata-lookup', () => ({
  lookupMetadata: vi.fn(),
  downloadImage: vi.fn(),
}));

vi.mock('../services/metadata-writer', () => ({
  writeMetadataToFile: vi.fn(async () => null),
}));

vi.mock('../protocols/art-protocol', () => ({
  saveAlbumArt: vi.fn(async () => 'shiranami-art://hash'),
}));

vi.mock('../app/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import mocked modules so we can configure return values per test
import { lookupMetadata, downloadImage } from '../services/metadata-lookup';
import { writeMetadataToFile } from '../services/metadata-writer';
import { saveAlbumArt } from '../protocols/art-protocol';

const mockedLookup = vi.mocked(lookupMetadata);
const mockedDownloadImage = vi.mocked(downloadImage);
const mockedWriteMetadata = vi.mocked(writeMetadataToFile);
const mockedSaveAlbumArt = vi.mocked(saveAlbumArt);

function makeTrack(overrides: Partial<EnrichTrackInput> = {}): EnrichTrackInput {
  return {
    id: '550e8400-e29b-41d4-a716-446655440001',
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
    (win as unknown as { isDestroyed: ReturnType<typeof vi.fn> }).isDestroyed = vi
      .fn()
      .mockReturnValue(false);
    setMockMainWindow(asBrowserWindow(win));
    registerMetadataEnrichHandlers();
  });

  afterEach(() => {
    cleanupMetadataEnrichHandlers();
    setMockMainWindow(null);
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
  // metadata:enrich:tracks — onlyMissing: true
  // ---------------------------------------------------------------
  describe('metadata:enrich:tracks with onlyMissing: true', () => {
    it('only fills fields that are missing/default, leaves existing values untouched', async () => {
      const track = makeTrack({
        artist: 'Existing Artist', // already has artist — should NOT be overwritten
        album: 'Unknown Album', // default — should be overwritten
        genre: 'Rock', // already has genre — should NOT be overwritten
        year: null, // missing — should be filled
        trackNumber: 5, // already has value — should NOT be overwritten
        albumArt: 'existing-art', // already has art — cover download should be skipped
      });

      mockedLookup.mockResolvedValue(makeLookupResult());

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const results = (await handler(null as never, [track], {
        writeToFile: false,
        onlyMissing: true,
      })) as EnrichTrackResult[];

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
  // metadata:enrich:tracks — onlyMissing: false
  // ---------------------------------------------------------------
  describe('metadata:enrich:tracks with onlyMissing: false', () => {
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

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const results = (await handler(null as never, [track], {
        writeToFile: false,
        onlyMissing: false,
      })) as EnrichTrackResult[];

      expect(results).toHaveLength(1);
      const r = results[0];
      expect(r.success).toBe(true);

      // All fields should be overwritten
      expect(r.updatedFields.artist).toBe('Found Artist');
      expect(r.updatedFields.album).toBe('Found Album');
      expect(r.updatedFields.genre).toBe('Pop');
      expect(r.updatedFields.year).toBe(2024);
      expect(r.updatedFields.trackNumber).toBe(3);

      // Cover art should be downloaded and saved to cache (signal is passed as second arg)
      expect(mockedDownloadImage).toHaveBeenCalledWith(
        'https://example.com/cover.jpg',
        expect.any(AbortSignal)
      );
      expect(mockedSaveAlbumArt).toHaveBeenCalled();
      expect(r.updatedFields.albumArt).toBe('shiranami-art://hash');
    });
  });

  // ---------------------------------------------------------------
  // metadata:enrich:cancel
  // ---------------------------------------------------------------
  describe('metadata:enrich:cancel', () => {
    it('stops scheduling new tracks once cancelled (worker pool)', async () => {
      // More tracks than the pool width: the first ENRICH_CONCURRENCY start
      // immediately; cancelling during the first track's lookup means the rest
      // of the queue is never picked up.
      const total = ENRICH_CONCURRENCY + 4;
      const tracks = Array.from({ length: total }, (_, i) =>
        makeTrack({
          id: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
          title: `Song ${i + 1}`,
        })
      );

      const cancelHandler = ipcHandlers.get('metadata:enrich:cancel')!;

      mockedLookup
        .mockImplementationOnce(async () => {
          // First in-flight track triggers the cancel, then resolves.
          await cancelHandler(null as never);
          return makeLookupResult({ coverImageUrl: undefined });
        })
        .mockResolvedValue(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const results = (await handler(null as never, tracks, {
        writeToFile: false,
        onlyMissing: false,
      })) as EnrichTrackResult[];

      // Only the tracks the pool had already picked up complete; the queued
      // remainder never runs.
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.length).toBeLessThanOrEqual(ENRICH_CONCURRENCY);
      expect(results.length).toBeLessThan(total);

      // A 'cancelled' progress event was emitted.
      const progressCalls = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich:progress'
      );
      const cancelledProgress = progressCalls.find(
        (c: unknown[]) => (c[1] as { status: string }).status === 'cancelled'
      );
      expect(cancelledProgress).toBeDefined();
    });

    it('preserves input order even though tasks finish out of order', async () => {
      // Make the second track's lookup resolve before the first's.
      let releaseFirst: (() => void) | null = null;
      mockedLookup
        .mockImplementationOnce(
          () =>
            new Promise<MetadataLookupResult>(resolve => {
              releaseFirst = () => resolve(makeLookupResult({ coverImageUrl: undefined }));
            })
        )
        .mockImplementationOnce(async () => {
          // Second track finishes immediately, then unblocks the first.
          releaseFirst?.();
          return makeLookupResult({ coverImageUrl: undefined });
        });

      const tracks = [
        makeTrack({ id: '550e8400-e29b-41d4-a716-446655440001', title: 'First' }),
        makeTrack({ id: '550e8400-e29b-41d4-a716-446655440002', title: 'Second' }),
      ];

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const results = (await handler(null as never, tracks, {
        writeToFile: false,
        onlyMissing: false,
      })) as EnrichTrackResult[];

      expect(results.map(r => r.id)).toEqual([
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
      ]);
    });

    it('threads match confidence + source into the done progress event', async () => {
      mockedLookup.mockResolvedValue(
        makeLookupResult({ coverImageUrl: undefined, confidence: 0.85, source: 'itunes' })
      );

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      await handler(null as never, [makeTrack()], { writeToFile: false, onlyMissing: false });

      const progressCalls = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich:progress'
      );
      const doneEvent = progressCalls
        .map(c => c[1] as { status: string; confidence?: number; source?: string })
        .find(p => p.status === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.confidence).toBe(0.85);
      expect(doneEvent!.source).toBe('itunes');
    });
  });

  // ---------------------------------------------------------------
  // cancel-while-idle is a no-op
  // ---------------------------------------------------------------
  describe('cancel-while-idle', () => {
    it('does not affect the next run when cancel is called with no active enrichment', async () => {
      mockedLookup.mockResolvedValue(makeLookupResult({ coverImageUrl: undefined }));

      // Fire cancel before any run has started
      const cancelHandler = ipcHandlers.get('metadata:enrich:cancel')!;
      await cancelHandler(null as never);

      // Start a run — it should complete normally, not see itself as already-cancelled
      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const results = (await handler(null as never, [makeTrack()], {
        writeToFile: false,
        onlyMissing: false,
      })) as EnrichTrackResult[];

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);

      // No cancelled progress event should have been emitted
      const progressCalls = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich:progress'
      );
      const cancelledProgress = progressCalls.find(
        (c: unknown[]) => (c[1] as { status: string }).status === 'cancelled'
      );
      expect(cancelledProgress).toBeUndefined();
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

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const results = (await handler(null as never, [makeTrack()], {
        writeToFile: false,
        onlyMissing: false,
      })) as EnrichTrackResult[];

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

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const results = (await handler(null as never, [makeTrack()], {
        writeToFile: false,
        onlyMissing: false,
      })) as EnrichTrackResult[];

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
        makeTrack({ id: '550e8400-e29b-41d4-a716-446655440001', title: 'Song 1' }),
        makeTrack({ id: '550e8400-e29b-41d4-a716-446655440002', title: 'Song 2' }),
      ];

      mockedLookup.mockResolvedValue(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const resultPromise = handler(null as never, tracks, {
        writeToFile: false,
        onlyMissing: false,
      });

      // Advance past the inter-track delay so both tracks are processed
      await vi.advanceTimersByTimeAsync(2000);
      await resultPromise;

      const progressCalls = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich:progress'
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
      (win as unknown as { isDestroyed: ReturnType<typeof vi.fn> }).isDestroyed.mockReturnValue(
        true
      );

      mockedLookup.mockResolvedValue(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
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
      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const results = (await handler(null as never, [track], {
        writeToFile: true,
        onlyMissing: false,
      })) as EnrichTrackResult[];

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
        }),
        expect.any(AbortSignal)
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
      expect(ipcHandlers.has('metadata:enrich:cancel')).toBe(true);
      expect(ipcHandlers.has('metadata:enrich:preview')).toBe(true);
      expect(ipcHandlers.has('metadata:enrich:tracks')).toBe(true);

      cleanupMetadataEnrichHandlers();

      expect(ipcHandlers.has('metadata:lookup')).toBe(false);
      expect(ipcHandlers.has('metadata:enrich:cancel')).toBe(false);
      expect(ipcHandlers.has('metadata:enrich:preview')).toBe(false);
      expect(ipcHandlers.has('metadata:enrich:tracks')).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // metadata:enrich:preview — single-track lookup-only path
  // ---------------------------------------------------------------
  describe('metadata:enrich:preview', () => {
    it('returns the would-be updatedFields without writing tags or DB', async () => {
      mockedLookup.mockResolvedValue(makeLookupResult());
      mockedDownloadImage.mockResolvedValue(Buffer.from('cover'));

      const handler = ipcHandlers.get('metadata:enrich:preview')!;
      const result = (await handler(null as never, makeTrack(), {
        onlyMissing: true,
      })) as EnrichTrackResult;

      expect(result.success).toBe(true);
      expect(result.source).toBe('itunes');
      expect(result.updatedFields.artist).toBe('Found Artist');
      expect(result.updatedFields.album).toBe('Found Album');
      // Cover is cached but the audio file is never touched.
      expect(mockedWriteMetadata).not.toHaveBeenCalled();
      expect(mockedSaveAlbumArt).toHaveBeenCalled();
      expect(result.updatedFields.albumArt).toBe('shiranami-art://hash');
    });

    it('returns success:false with source "none" when no match is found', async () => {
      mockedLookup.mockResolvedValue({ source: 'none', confidence: 0 });

      const handler = ipcHandlers.get('metadata:enrich:preview')!;
      const result = (await handler(null as never, makeTrack(), {
        onlyMissing: true,
      })) as EnrichTrackResult;

      expect(result.success).toBe(false);
      expect(result.source).toBe('none');
      expect(mockedWriteMetadata).not.toHaveBeenCalled();
    });

    it('rejects with metadata.enrich_busy when a bulk run is in flight', async () => {
      vi.useFakeTimers();

      // Block the lookup so the bulk handler holds the abort slot.
      let releaseLookup: (() => void) | null = null;
      mockedLookup.mockImplementationOnce(
        () =>
          new Promise<MetadataLookupResult>(resolve => {
            releaseLookup = () => resolve(makeLookupResult({ coverImageUrl: undefined }));
          })
      );

      const bulkHandler = ipcHandlers.get('metadata:enrich:tracks')!;
      const previewHandler = ipcHandlers.get('metadata:enrich:preview')!;

      // Start the bulk run; do NOT await it yet.
      const bulkPromise = bulkHandler(null as never, [makeTrack()], {
        writeToFile: false,
        onlyMissing: false,
      });

      // Yield once so the bulk handler claims the abort slot.
      await vi.advanceTimersByTimeAsync(0);

      // Preview must reject with the busy code while the bulk run holds the slot.
      // The error is transport-encoded at the handler boundary; decode it back.
      await expectIpcErrorCode(
        Promise.resolve(previewHandler(null as never, makeTrack(), { onlyMissing: true })),
        'metadata.enrich_busy'
      );

      // Let the bulk run finish so the test cleans up.
      releaseLookup?.();
      await vi.advanceTimersByTimeAsync(2000);
      await bulkPromise;

      vi.useRealTimers();
    });

    it('rejects with metadata.enrich_busy when a preview is in flight', async () => {
      vi.useFakeTimers();

      // Block the lookup so the preview handler holds the abort slot.
      let releaseLookup: (() => void) | null = null;
      mockedLookup.mockImplementationOnce(
        () =>
          new Promise<MetadataLookupResult>(resolve => {
            releaseLookup = () => resolve(makeLookupResult({ coverImageUrl: undefined }));
          })
      );

      const previewHandler = ipcHandlers.get('metadata:enrich:preview')!;
      const bulkHandler = ipcHandlers.get('metadata:enrich:tracks')!;

      // Start the preview; do NOT await it yet.
      const previewPromise = previewHandler(null as never, makeTrack(), { onlyMissing: true });

      // Yield once so the preview handler claims the abort slot.
      await vi.advanceTimersByTimeAsync(0);

      // Bulk must reject with the busy code while the preview holds the slot.
      await expectIpcErrorCode(
        Promise.resolve(
          bulkHandler(null as never, [makeTrack()], { writeToFile: false, onlyMissing: false })
        ),
        'metadata.enrich_busy'
      );

      // Let the preview finish so the test cleans up.
      releaseLookup?.();
      await vi.advanceTimersByTimeAsync(0);
      await previewPromise;

      vi.useRealTimers();
    });
  });

  // ---------------------------------------------------------------
  // Sequential runs do not share aborted state
  // ---------------------------------------------------------------
  describe('sequential runs with cancellation', () => {
    it('second run completes normally after the first run was cancelled', async () => {
      vi.useFakeTimers();

      const tracks = [
        makeTrack({ id: '550e8400-e29b-41d4-a716-446655440001', title: 'Song 1' }),
        makeTrack({ id: '550e8400-e29b-41d4-a716-446655440002', title: 'Song 2' }),
      ];

      mockedLookup.mockResolvedValue(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const cancelHandler = ipcHandlers.get('metadata:enrich:cancel')!;

      // --- Run 1: start then cancel ---
      const run1 = handler(null as never, tracks, {
        writeToFile: false,
        onlyMissing: false,
      }) as Promise<EnrichTrackResult[]>;

      await vi.advanceTimersByTimeAsync(0);
      await cancelHandler(null as never);
      await vi.advanceTimersByTimeAsync(1000);
      await run1;

      vi.clearAllMocks();
      win.webContents.send.mockClear();

      // --- Run 2: fresh run, must not see the previous controller's aborted state ---
      const run2 = handler(null as never, [makeTrack({ title: 'Fresh Song' })], {
        writeToFile: false,
        onlyMissing: false,
      }) as Promise<EnrichTrackResult[]>;

      await vi.advanceTimersByTimeAsync(0);
      const results2 = await run2;

      expect(results2).toHaveLength(1);
      expect(results2[0].success).toBe(true);

      const progressCalls2 = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich:progress'
      );
      const cancelledEvent = progressCalls2.find(
        (c: unknown[]) => (c[1] as { status: string }).status === 'cancelled'
      );
      expect(cancelledEvent).toBeUndefined();

      vi.useRealTimers();
    });
  });

  // ---------------------------------------------------------------
  // Error handling per-track
  // ---------------------------------------------------------------
  describe('per-track error handling', () => {
    it('catches errors per track and continues processing remaining tracks', async () => {
      vi.useFakeTimers();

      const tracks = [
        makeTrack({ id: '550e8400-e29b-41d4-a716-446655440001', title: 'Failing Song' }),
        makeTrack({ id: '550e8400-e29b-41d4-a716-446655440002', title: 'Good Song' }),
      ];

      mockedLookup
        .mockRejectedValueOnce(new Error('API timeout'))
        .mockResolvedValueOnce(makeLookupResult({ coverImageUrl: undefined }));

      const handler = ipcHandlers.get('metadata:enrich:tracks')!;
      const resultPromise = handler(null as never, tracks, {
        writeToFile: false,
        onlyMissing: false,
      });

      await vi.advanceTimersByTimeAsync(2000);
      const results = (await resultPromise) as EnrichTrackResult[];

      expect(results).toHaveLength(2);

      // First track failed
      expect(results[0].id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('API timeout');
      expect(results[0].source).toBe('none');

      // Second track succeeded
      expect(results[1].id).toBe('550e8400-e29b-41d4-a716-446655440002');
      expect(results[1].success).toBe(true);
      expect(results[1].source).toBe('itunes');

      // Error progress event was sent for first track
      const progressCalls = win.webContents.send.mock.calls.filter(
        (c: unknown[]) => c[0] === 'metadata:enrich:progress'
      );
      const errorEvent = progressCalls.find(
        (c: unknown[]) => (c[1] as { status: string }).status === 'error'
      );
      expect(errorEvent).toBeDefined();

      vi.useRealTimers();
    });
  });
});
