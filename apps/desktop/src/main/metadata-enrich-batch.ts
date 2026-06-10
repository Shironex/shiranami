import type {
  EnrichTrackInput,
  EnrichTrackResult,
  EnrichProgress,
  MetadataLookupSource,
} from '@shiranami/contracts';
import { mapWithConcurrency } from '@shiranami/shared';
import { lookupMetadata, downloadImage, type MetadataLookupResult } from './metadata-lookup';
import { writeMetadataToFile, type WriteMetadataOptions } from './metadata-writer';
import { logger } from './logger';

/** Number of tracks enriched concurrently in a bulk run. The per-host gates in
 *  http.ts already serialize the actual iTunes / cover-art requests, so this
 *  just lets one task wait on the iTunes gate while others download covers or
 *  write tags — no rate-limit risk. */
export const ENRICH_CONCURRENCY = 4;

/**
 * Compute the proposed updated fields for a single track from a lookup result.
 * `onlyMissing` mirrors the bulk gate at the renderer + this file's previous
 * inline check: when true, only fill fields that are absent or set to the
 * 'Unknown Artist' / 'Unknown Album' sentinels written by the scanner.
 */
function computeUpdatedFields(
  track: EnrichTrackInput,
  lookup: MetadataLookupResult,
  onlyMissing: boolean
): EnrichTrackResult['updatedFields'] {
  const updatedFields: EnrichTrackResult['updatedFields'] = {};

  if (onlyMissing) {
    if (track.artist === 'Unknown Artist' && lookup.artist) {
      updatedFields.artist = lookup.artist;
    }
    if (track.album === 'Unknown Album' && lookup.album) {
      updatedFields.album = lookup.album;
    }
    if (!track.genre && lookup.genre) {
      updatedFields.genre = lookup.genre;
    }
    if (!track.year && lookup.year) {
      updatedFields.year = lookup.year;
    }
    if (!track.trackNumber && lookup.trackNumber) {
      updatedFields.trackNumber = lookup.trackNumber;
    }
  } else {
    if (lookup.artist) updatedFields.artist = lookup.artist;
    if (lookup.album) updatedFields.album = lookup.album;
    if (lookup.genre) updatedFields.genre = lookup.genre;
    if (lookup.year) updatedFields.year = lookup.year;
    if (lookup.trackNumber) updatedFields.trackNumber = lookup.trackNumber;
  }

  return updatedFields;
}

interface EnrichOneOptions {
  writeToFile: boolean;
  onlyMissing: boolean;
  /**
   * When 'preview', the helper performs the lookup + cover-art download (and
   * caches the cover via `saveAlbumArt` so the renderer can show it without
   * a second round-trip), but does NOT write tags to the file regardless of
   * `writeToFile`. Use this for the per-track confirmation flow.
   */
  mode: 'apply' | 'preview';
}

interface EnrichOneProgressHooks {
  onSearching?: () => void;
  onDownloading?: () => void;
  onWriting?: () => void;
}

/**
 * Per-track enrichment body shared by the bulk handler and the preview handler.
 * Throws if `signal` aborts mid-flight; the caller decides whether to record a
 * cancelled progress event or simply return.
 */
export async function enrichSingleTrack(
  track: EnrichTrackInput,
  options: EnrichOneOptions,
  signal: AbortSignal,
  hooks: EnrichOneProgressHooks = {}
): Promise<EnrichTrackResult> {
  hooks.onSearching?.();

  const lookup = await lookupMetadata(track.title, track.artist, signal);

  if (lookup.source === 'none') {
    return {
      id: track.id,
      success: false,
      updatedFields: {},
      source: 'none',
      error: 'No metadata found',
    };
  }

  const updatedFields = computeUpdatedFields(track, lookup, options.onlyMissing);

  // Cover art: skip download when the track already has art and onlyMissing
  // is true. For preview we still resolve the cover so the dialog can show it.
  let coverImageBuffer: Buffer | undefined;
  let coverImageMime: string | undefined;
  const needsCover = options.onlyMissing ? !track.albumArt : true;

  if (lookup.coverImageUrl && needsCover) {
    hooks.onDownloading?.();
    try {
      coverImageBuffer = await downloadImage(lookup.coverImageUrl, signal);
      coverImageMime = lookup.coverImageUrl.toLowerCase().includes('.png')
        ? 'image/png'
        : 'image/jpeg';
    } catch (dlError) {
      logger.warn(`[metadata:enrich] Failed to download cover art for "${track.title}":`, dlError);
    }
  }

  if (options.mode === 'apply' && options.writeToFile) {
    hooks.onWriting?.();
    const writeOptions: WriteMetadataOptions = {
      ...updatedFields,
      coverImageBuffer,
      coverImageMime,
    };
    const albumArtUrl = await writeMetadataToFile(track.filePath, writeOptions, signal);
    if (albumArtUrl) {
      updatedFields.albumArt = albumArtUrl;
    }
  } else if (coverImageBuffer && coverImageMime) {
    // Either preview mode or apply-without-file-write: cache the cover so the
    // renderer can display + commit it via DB-only update. Orphaned cache
    // entries (preview-then-discard) are harmless and dedupe by content hash.
    const { saveAlbumArt } = await import('./art-protocol');
    const albumArtUrl = await saveAlbumArt(coverImageBuffer, coverImageMime);
    if (albumArtUrl) {
      updatedFields.albumArt = albumArtUrl;
    }
  }

  return {
    id: track.id,
    // By this point the early-return for source === 'none' has already fired,
    // so a match was always found here — success reflects match presence, not field count.
    success: true,
    updatedFields,
    source: lookup.source,
    confidence: lookup.confidence,
  };
}

/**
 * Worker-pool runner for bulk enrichment. Pulls tracks off a shared cursor,
 * enriches up to `ENRICH_CONCURRENCY` concurrently, and streams progress via
 * `onProgress`. The returned array preserves input order. The handler owns the
 * abort slot + IPC wiring; this function owns the scheduling/cancellation loop.
 */
export async function runEnrichmentBatch(
  tracks: EnrichTrackInput[],
  options: { writeToFile: boolean; onlyMissing: boolean },
  signal: AbortSignal,
  onProgress: (progress: EnrichProgress) => void
): Promise<EnrichTrackResult[]> {
  const total = tracks.length;

  const sendProgress = onProgress;

  // Monotonic completed-count so the renderer's progress bar never jumps
  // backward when faster tasks finish before slower ones.
  let completed = 0;
  let cancelled = false;

  const inFlightCurrent = () => Math.min(completed + 1, total);

  const enrichOne = async (
    track: EnrichTrackInput,
    i: number
  ): Promise<EnrichTrackResult | undefined> => {
    if (signal.aborted) {
      if (!cancelled) {
        cancelled = true;
        logger.info(`[metadata:enrich] Cancelled after ${completed}/${total} tracks`);
        sendProgress({
          current: Math.min(completed, total),
          total,
          trackName: track.title,
          status: 'cancelled',
        });
      }
      return undefined;
    }

    try {
      const result = await enrichSingleTrack(
        track,
        {
          writeToFile: options.writeToFile,
          onlyMissing: options.onlyMissing,
          mode: 'apply',
        },
        signal,
        {
          onSearching: () =>
            sendProgress({
              current: inFlightCurrent(),
              total,
              trackName: track.title,
              status: 'searching',
            }),
          onDownloading: () =>
            sendProgress({
              current: inFlightCurrent(),
              total,
              trackName: track.title,
              status: 'downloading',
            }),
          onWriting: () =>
            sendProgress({
              current: inFlightCurrent(),
              total,
              trackName: track.title,
              status: 'writing',
            }),
        }
      );

      const fieldCount = Object.keys(result.updatedFields).length;
      if (result.source === 'none') {
        logger.info(`[metadata:enrich] [${i + 1}/${total}] No results: "${track.title}"`);
      } else {
        logger.info(
          `[metadata:enrich] [${i + 1}/${total}] ${fieldCount > 0 ? 'Updated' : 'No changes'}: "${track.title}" (source: ${result.source}, confidence: ${result.confidence?.toFixed(2) ?? 'n/a'}, fields: ${fieldCount > 0 ? Object.keys(result.updatedFields).join(', ') : 'none'})`
        );
      }

      completed += 1;
      sendProgress({
        current: completed,
        total,
        trackName: track.title,
        status: 'done',
        confidence: result.confidence,
        // result.source is always a MetadataLookupSource here; the
        // 'preview' variant of EnrichResultSource is only produced by
        // the DB-only apply path in the renderer, never the bulk worker.
        source: result.source as MetadataLookupSource,
      });
      return result;
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        if (!cancelled) {
          cancelled = true;
          sendProgress({
            current: Math.min(completed, total),
            total,
            trackName: track.title,
            status: 'cancelled',
          });
        }
        return undefined;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`[metadata:enrich] Failed to enrich "${track.title}":`, error);

      completed += 1;
      sendProgress({
        current: completed,
        total,
        trackName: track.title,
        status: 'error',
      });
      return {
        id: track.id,
        success: false,
        updatedFields: {},
        source: 'none',
        error: errorMessage,
      };
    }
  };

  // Results are slotted by input index so the returned array preserves
  // input order even though tasks finish out of order.
  const slots = await mapWithConcurrency(tracks, ENRICH_CONCURRENCY, enrichOne);

  const results = slots.filter((r): r is EnrichTrackResult => r !== undefined);
  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  logger.info(
    `[metadata:enrich] Batch complete: ${successCount} updated, ${failedCount} failed/no-results out of ${total} tracks${signal.aborted ? ' (cancelled)' : ''}`
  );

  return results;
}
