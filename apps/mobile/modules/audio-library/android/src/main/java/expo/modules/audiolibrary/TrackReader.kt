package expo.modules.audiolibrary

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.channels.FileChannel
import java.util.UUID

/** Longest side of a saved cover, in pixels: sharp on the full player, small on disk. */
private const val ART_MAX_SIDE = 512
private const val ART_QUALITY = 85

/** A [ByteSource] over an open file descriptor, by positional reads. */
private class ChannelSource(private val channel: FileChannel, override val length: Long) : ByteSource {
  override fun readAt(position: Long, buffer: ByteArray, offset: Int, count: Int): Int {
    if (position >= length) return 0
    val target = ByteBuffer.wrap(buffer, offset, count)
    var filled = 0
    while (target.hasRemaining()) {
      val got = channel.read(target, position + filled)
      if (got <= 0) break
      filled += got
    }
    return filled
  }
}

/** Tags, identity and saved artwork of one file. Missing values are null. */
data class TrackInfo(
  val contentHash: String,
  val size: Long,
  val title: String?,
  val artist: String?,
  val album: String?,
  val albumArtist: String?,
  val trackNumber: Int?,
  val year: Int?,
  val genre: String?,
  val durationMs: Long?,
  val artUri: String?,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "contentHash" to contentHash,
    "size" to size.toDouble(),
    "title" to title,
    "artist" to artist,
    "album" to album,
    "albumArtist" to albumArtist,
    "trackNumber" to trackNumber,
    "year" to year,
    "genre" to genre,
    "durationMs" to durationMs?.toDouble(),
    "artUri" to artUri,
  )
}

/**
 * Reads a file once: the content hash over its bytes, then its tags and
 * embedded cover through [MediaMetadataRetriever], which covers MP3, FLAC,
 * Ogg Vorbis and Opus, M4A/AAC and WAV.
 */
class TrackReader(private val context: Context) {
  /** Null when the file cannot be opened (deleted, permission revoked). */
  fun read(uri: Uri, artDir: File): TrackInfo? {
    val descriptor = try {
      context.contentResolver.openFileDescriptor(uri, "r")
    } catch (_: Exception) {
      null
    } ?: return null

    return descriptor.use { pfd ->
      val hash: String
      val size: Long
      try {
        val stream = java.io.FileInputStream(pfd.fileDescriptor)
        val channel = stream.channel
        size = if (pfd.statSize >= 0) pfd.statSize else channel.size()
        hash = ContentHash.of(ChannelSource(channel, size))
      } catch (_: Exception) {
        return@use null
      }
      readTags(pfd, hash, size, artDir)
    }
  }

  private fun readTags(pfd: ParcelFileDescriptor, hash: String, size: Long, artDir: File): TrackInfo {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(pfd.fileDescriptor)
    } catch (_: Exception) {
      retriever.release()
      return TrackInfo(hash, size, null, null, null, null, null, null, null, null, null)
    }
    try {
      fun text(key: Int): String? = retriever.extractMetadata(key)?.trim()?.takeIf { it.isNotEmpty() }
      return TrackInfo(
        contentHash = hash,
        size = size,
        title = text(MediaMetadataRetriever.METADATA_KEY_TITLE),
        artist = text(MediaMetadataRetriever.METADATA_KEY_ARTIST),
        album = text(MediaMetadataRetriever.METADATA_KEY_ALBUM),
        albumArtist = text(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST),
        // "3/12" or "3".
        trackNumber = text(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER)
          ?.substringBefore('/')?.trim()?.toIntOrNull(),
        year = parseYear(
          text(MediaMetadataRetriever.METADATA_KEY_YEAR)
            ?: text(MediaMetadataRetriever.METADATA_KEY_DATE)
        ),
        genre = text(MediaMetadataRetriever.METADATA_KEY_GENRE),
        durationMs = text(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()?.takeIf { it > 0 },
        artUri = saveArt(retriever, hash, artDir),
      )
    } finally {
      retriever.release()
    }
  }

  /** "2008", "20080101T000000.000Z" or "2008-01-01" to 2008. */
  private fun parseYear(value: String?): Int? {
    val digits = value?.take(4) ?: return null
    return digits.toIntOrNull()?.takeIf { it in 1000..9999 }
  }

  /**
   * The embedded cover, downscaled and written once per content hash as
   * `<hex>.jpg`. A later read of the same file reuses the saved file.
   */
  private fun saveArt(retriever: MediaMetadataRetriever, hash: String, artDir: File): String? {
    val name = hash.substringAfter(':') + ".jpg"
    val target = File(artDir, name)
    if (target.exists()) return Uri.fromFile(target).toString()

    val bytes = try {
      retriever.embeddedPicture
    } catch (_: Exception) {
      null
    } ?: return null

    return try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

      var sample = 1
      while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= ART_MAX_SIDE) sample *= 2
      val decoded = BitmapFactory.decodeByteArray(
        bytes,
        0,
        bytes.size,
        BitmapFactory.Options().apply { inSampleSize = sample },
      ) ?: return null

      val longest = maxOf(decoded.width, decoded.height)
      val scaled = if (longest > ART_MAX_SIDE) {
        val ratio = ART_MAX_SIDE.toFloat() / longest
        Bitmap.createScaledBitmap(
          decoded,
          (decoded.width * ratio).toInt().coerceAtLeast(1),
          (decoded.height * ratio).toInt().coerceAtLeast(1),
          true,
        )
      } else {
        decoded
      }

      artDir.mkdirs()
      // Written beside the target and renamed, so a half-written cover is never picked up.
      // The temp name is unique: two files with one hash may be read at the same time.
      val partial = File(artDir, "$name.${UUID.randomUUID()}.part")
      FileOutputStream(partial).use { out -> scaled.compress(Bitmap.CompressFormat.JPEG, ART_QUALITY, out) }
      if (scaled !== decoded) scaled.recycle()
      decoded.recycle()
      // rename(2) replaces an existing target atomically; if another thread won
      // the race in some other way, its cover is the same picture.
      if (!partial.renameTo(target)) {
        partial.delete()
        if (!target.exists()) return null
      }
      Uri.fromFile(target).toString()
    } catch (_: Exception) {
      null
    } catch (_: OutOfMemoryError) {
      null
    }
  }
}
