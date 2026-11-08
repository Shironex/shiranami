package expo.modules.audiolibrary

import java.security.MessageDigest

/** Random access to the bytes of one file. */
interface ByteSource {
  val length: Long

  /** Fills as much of `buffer[offset, offset + count)` as the file holds from `position`. */
  fun readAt(position: Long, buffer: ByteArray, offset: Int, count: Int): Int
}

/** A byte range, `start` inclusive, `end` exclusive. */
data class Span(val start: Long, val end: Long)

/**
 * The content identity of an audio file, the same value the desktop app stores
 * in `tracks.content_hash` (migration 0009, `shiranami_library::identity`).
 *
 * SHA-256 over a domain tag, the scheme name, the audio payload length (little
 * endian u64), then the payload itself: whole when it is at most five windows
 * long, otherwise five 64 KiB windows spread evenly from its first byte to its
 * last. The payload skips every tag block ([AudioPayload]), so a retag keeps
 * the hash. Stored as `"a1:<hex sha256>"`.
 */
object ContentHash {
  const val SCHEME = "a1"
  const val WINDOW = 64L * 1024
  const val WINDOWS = 5L

  private val DOMAIN = "shiranami/content-identity\u0000".toByteArray(Charsets.US_ASCII)

  fun of(source: ByteSource): String {
    val len = source.length
    val range = AudioPayload.range(source, len)

    val digest = MessageDigest.getInstance("SHA-256")
    digest.update(DOMAIN)
    digest.update(SCHEME.toByteArray(Charsets.US_ASCII))
    val payloadLen = range.end - range.start
    digest.update(littleEndian(payloadLen))

    val buffer = ByteArray(WINDOW.toInt())
    if (payloadLen <= WINDOW * WINDOWS) {
      var at = range.start
      while (at < range.end) {
        val want = minOf(range.end - at, WINDOW).toInt()
        val got = source.readAt(at, buffer, 0, want)
        if (got <= 0) break
        digest.update(buffer, 0, got)
        at += got
      }
    } else {
      val span = payloadLen - WINDOW
      for (index in 0 until WINDOWS) {
        val at = range.start + span * index / (WINDOWS - 1)
        val got = source.readAt(at, buffer, 0, buffer.size)
        if (got > 0) digest.update(buffer, 0, got)
      }
    }

    return SCHEME + ":" + digest.digest().joinToString("") { "%02x".format(it) }
  }

  private fun littleEndian(value: Long): ByteArray =
    ByteArray(8) { index -> (value ushr (8 * index)).toByte() }
}

/**
 * Where a file's audio payload starts and ends, with tag blocks skipped. A
 * line for line port of `shiranami_library::identity::payload`: detection by
 * content, every walk bounded, anything malformed or unknown is the whole file.
 */
object AudioPayload {
  private const val MAX_STEPS = 1024
  private const val MP4_MAX_BOXES = 16_384
  private const val ID3V2_HEADER = 10L
  private const val ID3V1_LEN = 128L
  private const val APE_FOOTER = 32L
  private const val LYRICS3_TRAILER = 15L

  fun range(file: ByteSource, len: Long): Span {
    var start = 0L
    for (step in 0 until MAX_STEPS) {
      val tag = id3v2LenAt(file, start, len) ?: break
      start += tag
    }
    if (start >= len) return Span(0, len)

    val headBuffer = ByteArray(12)
    val got = file.readAt(start, headBuffer, 0, 12).coerceAtLeast(0)
    val head = headBuffer.copyOf(got)

    val range: Span? = when {
      head.startsWith("fLaC") -> flac(file, start, len)
      head.size == 12 && head.matches(0, "RIFF") && head.matches(8, "WAVE") ->
        riffData(file, start, len)
      head.size >= 8 && head.matches(4, "ftyp") -> mp4Mdat(file, start, len)
      head.startsWith("OggS") -> null
      else -> Span(start, trimTrailingTags(file, start, len))
    }

    return if (range != null && range.start < range.end && range.end <= len) range else Span(0, len)
  }

  private fun read(file: ByteSource, at: Long, count: Int): Pair<ByteArray, Int> {
    val buffer = ByteArray(count)
    val got = file.readAt(at, buffer, 0, count).coerceAtLeast(0)
    return buffer to got
  }

  private fun id3v2LenAt(file: ByteSource, at: Long, len: Long): Long? {
    val (header, got) = read(file, at, ID3V2_HEADER.toInt())
    if (got < header.size || !header.matches(0, "ID3")) return null
    val body = syncsafe(header, 6) ?: return null
    val footer = if (header[5].toInt() and 0x10 != 0) ID3V2_HEADER else 0L
    val total = ID3V2_HEADER + body + footer
    return if (at + total <= len) total else null
  }

  private fun syncsafe(bytes: ByteArray, from: Int): Long? {
    var acc = 0L
    for (index in from until from + 4) {
      val byte = bytes[index].toInt() and 0xff
      if (byte and 0x80 != 0) return null
      acc = (acc shl 7) or byte.toLong()
    }
    return acc
  }

  private fun flac(file: ByteSource, start: Long, len: Long): Span? {
    var at = start + 4
    for (step in 0 until MAX_STEPS) {
      val (header, got) = read(file, at, 4)
      if (got < 4) return null
      val body = ((header[1].toLong() and 0xff) shl 16) or
        ((header[2].toLong() and 0xff) shl 8) or
        (header[3].toLong() and 0xff)
      at += 4 + body
      if (at > len) return null
      if (header[0].toInt() and 0x80 != 0) return Span(at, len)
    }
    return null
  }

  private fun riffData(file: ByteSource, start: Long, len: Long): Span? {
    var at = start + 12
    for (step in 0 until MAX_STEPS) {
      val (header, got) = read(file, at, 8)
      if (got < 8) return null
      val body = u32le(header, 4)
      val bodyStart = at + 8
      if (header.matches(0, "data")) return Span(bodyStart, minOf(bodyStart + body, len))
      at = bodyStart + body + (body and 1L)
      if (at >= len) return null
    }
    return null
  }

  /** Box sizes are u64 on disk, so this walk runs in unsigned arithmetic like the original. */
  private fun mp4Mdat(file: ByteSource, start: Long, len: Long): Span? {
    val length = len.toULong()
    var at = start.toULong()
    var first: Pair<ULong, ULong>? = null
    var lastEnd: ULong? = null
    var fragmented = false
    for (step in 0 until MP4_MAX_BOXES) {
      if (at >= length) {
        val found = first ?: return null
        val end = if (fragmented && lastEnd != null) lastEnd else found.second
        return Span(found.first.toLong(), end.toLong())
      }
      val (header, got) = read(file, at.toLong(), 8)
      if (got < 8) return null
      val size32 = u32be(header, 0).toULong()
      val headerLen: ULong
      val size: ULong
      when (size32) {
        0uL -> {
          headerLen = 8uL
          size = length - at
        }
        1uL -> {
          val (large, gotLarge) = read(file, at.toLong() + 8, 8)
          if (gotLarge < 8) return null
          headerLen = 16uL
          size = u64be(large)
        }
        else -> {
          headerLen = 8uL
          size = size32
        }
      }
      val next = at + size
      if (next < at) return null
      if (size < headerLen) return null
      when {
        header.matches(4, "mdat") -> {
          val end = minOf(next, length)
          if (first == null) first = (at + headerLen) to end
          lastEnd = end
        }
        header.matches(4, "moof") -> fragmented = true
      }
      at = next
    }
    return null
  }

  private fun trimTrailingTags(file: ByteSource, start: Long, len: Long): Long {
    var end = len
    for (step in 0 until MAX_STEPS) {
      val peeled = peelOne(file, start, end)
      if (peeled == 0L) break
      end -= peeled
    }
    return end
  }

  private fun peelOne(file: ByteSource, start: Long, end: Long): Long {
    val room = end - start

    if (room >= ID3V1_LEN) {
      val (marker, _) = read(file, end - ID3V1_LEN, 3)
      if (marker.matches(0, "TAG")) return ID3V1_LEN
    }

    if (room >= APE_FOOTER) {
      val (footer, _) = read(file, end - APE_FOOTER, APE_FOOTER.toInt())
      if (footer.matches(0, "APETAGEX")) {
        val size = u32le(footer, 12)
        val flags = u32le(footer, 20)
        val header = if (flags and 0x8000_0000L != 0L) APE_FOOTER else 0L
        val total = size + header
        if (total >= APE_FOOTER && total <= room) return total
      }
    }

    if (room >= LYRICS3_TRAILER) {
      val (trailer, _) = read(file, end - LYRICS3_TRAILER, LYRICS3_TRAILER.toInt())
      if (trailer.matches(6, "LYRICS200")) {
        val size = asciiDecimal(trailer, 0, 6)
        if (size != null) {
          val total = size + LYRICS3_TRAILER
          if (total <= room) return total
        }
      }
    }

    if (room >= ID3V2_HEADER) {
      val (footer, _) = read(file, end - ID3V2_HEADER, ID3V2_HEADER.toInt())
      if (footer.matches(0, "3DI")) {
        val body = syncsafe(footer, 6)
        if (body != null) {
          val total = 2 * ID3V2_HEADER + body
          if (total <= room) return total
        }
      }
    }

    return 0L
  }

  private fun asciiDecimal(bytes: ByteArray, from: Int, count: Int): Long? {
    var acc = 0L
    for (index in from until from + count) {
      val byte = bytes[index].toInt() and 0xff
      if (byte < '0'.code || byte > '9'.code) return null
      acc = acc * 10 + (byte - '0'.code)
    }
    return acc
  }

  private fun u32le(bytes: ByteArray, at: Int): Long =
    (bytes[at].toLong() and 0xff) or
      ((bytes[at + 1].toLong() and 0xff) shl 8) or
      ((bytes[at + 2].toLong() and 0xff) shl 16) or
      ((bytes[at + 3].toLong() and 0xff) shl 24)

  private fun u32be(bytes: ByteArray, at: Int): Long =
    ((bytes[at].toLong() and 0xff) shl 24) or
      ((bytes[at + 1].toLong() and 0xff) shl 16) or
      ((bytes[at + 2].toLong() and 0xff) shl 8) or
      (bytes[at + 3].toLong() and 0xff)

  private fun u64be(bytes: ByteArray): ULong {
    var acc = 0uL
    for (index in 0 until 8) acc = (acc shl 8) or (bytes[index].toULong() and 0xffuL)
    return acc
  }

  private fun ByteArray.matches(at: Int, ascii: String): Boolean {
    if (at + ascii.length > size) return false
    for (index in ascii.indices) {
      if (this[at + index] != ascii[index].code.toByte()) return false
    }
    return true
  }

  private fun ByteArray.startsWith(ascii: String): Boolean = matches(0, ascii)
}
