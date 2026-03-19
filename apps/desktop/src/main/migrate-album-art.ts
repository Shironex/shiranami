import { getDatabase, tracks, eq, like } from '@shiranami/database';
import { saveAlbumArt } from './art-protocol';
import { logger } from './logger';

/**
 * Migrate existing base64 album art data URLs in the database to disk files
 * served via the shiranami-art:// protocol.
 *
 * Idempotent — skips tracks that already use protocol URLs.
 */
export async function migrateAlbumArtToDisk(): Promise<void> {
  const db = getDatabase();

  // Find tracks with base64 album art (starts with "data:")
  const rows = db
    .select({ id: tracks.id, albumArt: tracks.albumArt })
    .from(tracks)
    .where(like(tracks.albumArt, 'data:%'))
    .all();

  if (rows.length === 0) {
    logger.debug('[migrate-art] No base64 album art to migrate');
    return;
  }

  logger.info(`[migrate-art] Migrating ${rows.length} tracks from base64 to disk...`);

  let migrated = 0;
  let failed = 0;

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

      const artUrl = saveAlbumArt(buffer, mimeType);
      if (!artUrl) {
        failed++;
        continue;
      }

      db.update(tracks)
        .set({ albumArt: artUrl })
        .where(eq(tracks.id, row.id))
        .run();

      migrated++;
    } catch (err) {
      logger.warn(`[migrate-art] Failed to migrate track ${row.id}:`, err);
      failed++;
    }
  }

  logger.info(`[migrate-art] Done: ${migrated} migrated, ${failed} failed`);
}
