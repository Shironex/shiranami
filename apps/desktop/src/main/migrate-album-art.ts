import { tracks, eq, like } from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { saveAlbumArt } from './art-protocol';
import { logger } from './logger';
import { store } from './store';

const BATCH_SIZE = 50;

/**
 * Migrate existing base64 album art data URLs in the database to disk files
 * served via the shiranami-art:// protocol.
 *
 * Idempotent — skips tracks that already use protocol URLs.
 * Processes in batches to avoid loading all base64 data into memory at once.
 */
export async function migrateAlbumArtToDisk(): Promise<void> {
  if (store.get('migrations.albumArtV1')) {
    return;
  }

  const db = getDatabase();

  let migrated = 0;
  let failed = 0;

  // Process in batches — each iteration converts rows away from "data:" prefix,
  // so re-querying with the same WHERE clause naturally advances through remaining rows.
  while (true) {
    const rows = db
      .select({ id: tracks.id, albumArt: tracks.albumArt })
      .from(tracks)
      .where(like(tracks.albumArt, 'data:%'))
      .limit(BATCH_SIZE)
      .all();

    if (rows.length === 0) break;

    if (migrated === 0 && failed === 0) {
      logger.info(`[migrate-art] Migrating tracks from base64 to disk...`);
    }

    for (const row of rows) {
      try {
        if (!row.albumArt) continue;

        // Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
        const match = row.albumArt.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          logger.warn(`[migrate-art] Invalid data URL for track ${row.id}`);
          failed++;
          continue;
        }

        const mimeType = match[1];
        const base64Data = match[2];
        const buffer = Buffer.from(base64Data, 'base64');

        const artUrl = await saveAlbumArt(buffer, mimeType);
        if (!artUrl) {
          failed++;
          continue;
        }

        db.update(tracks).set({ albumArt: artUrl }).where(eq(tracks.id, row.id)).run();

        migrated++;
      } catch (err) {
        logger.warn(`[migrate-art] Failed to migrate track ${row.id}:`, err);
        failed++;
      }
    }
  }

  if (migrated > 0 || failed > 0) {
    logger.info(`[migrate-art] Done: ${migrated} migrated, ${failed} failed`);
  } else {
    logger.debug('[migrate-art] No base64 album art to migrate');
  }

  store.set('migrations.albumArtV1', true);
}
