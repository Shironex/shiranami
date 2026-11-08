package expo.modules.audiolibrary

import java.io.ByteArrayOutputStream
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The phone must hash a file exactly like the desktop does. These fixtures and
 * values mirror `golden_values_shared_with_the_android_port` in
 * `crates/shiranami-library/src/identity/tests.rs`, byte for byte.
 */
class ContentHashTest {
  private class Bytes(private val bytes: ByteArray) : ByteSource {
    override val length: Long = bytes.size.toLong()

    override fun readAt(position: Long, buffer: ByteArray, offset: Int, count: Int): Int {
      if (position >= length) return 0
      val got = minOf(count.toLong(), length - position).toInt()
      System.arraycopy(bytes, position.toInt(), buffer, offset, got)
      return got
    }
  }

  /** The xorshift stand-in for encoded audio, as in the Rust tests. */
  private fun noise(len: Int, seed: Int): ByteArray {
    var state = seed * 2_654_435_761L.toInt() + 1
    return ByteArray(len) {
      state = state xor (state shl 13)
      state = state xor (state ushr 17)
      state = state xor (state shl 5)
      state.toByte()
    }
  }

  private fun bytes(build: ByteArrayOutputStream.() -> Unit): ByteArray =
    ByteArrayOutputStream().apply(build).toByteArray()

  private fun ByteArrayOutputStream.ascii(text: String) = write(text.toByteArray(Charsets.US_ASCII))

  private fun ByteArrayOutputStream.le32(value: Long) {
    for (shift in 0 until 4) write(((value ushr (8 * shift)) and 0xff).toInt())
  }

  private fun ByteArrayOutputStream.be32(value: Long) {
    for (shift in 3 downTo 0) write(((value ushr (8 * shift)) and 0xff).toInt())
  }

  private fun ByteArrayOutputStream.fill(count: Int, byte: Int) {
    repeat(count) { write(byte) }
  }

  private fun id3v2(body: Int) = bytes {
    ascii("ID3")
    write(4)
    write(0)
    write(0)
    for (shift in 3 downTo 0) write((body shr (7 * shift)) and 0x7f)
    fill(body, 0)
  }

  private fun id3v1(title: String) = bytes {
    ascii("TAG")
    ascii(title)
    fill(128 - 3 - title.length, 0)
  }

  private fun apev2(items: Int): ByteArray {
    fun block(flags: Long) = bytes {
      ascii("APETAGEX")
      le32(2000)
      le32(items + 32L)
      le32(1)
      le32(flags)
      fill(8, 0)
    }
    return bytes {
      write(block(0xa000_0000L))
      fill(items, 'x'.code)
      write(block(0x8000_0000L))
    }
  }

  private fun mp3(frames: ByteArray, leading: Int, trailing: List<ByteArray>) = bytes {
    write(id3v2(leading))
    write(frames)
    trailing.forEach { write(it) }
  }

  private fun flac(frames: ByteArray, comment: Int, padding: Int): ByteArray {
    fun block(kind: Int, last: Boolean, body: Int) = bytes {
      write(kind or if (last) 0x80 else 0)
      write((body shr 16) and 0xff)
      write((body shr 8) and 0xff)
      write(body and 0xff)
      fill(body, kind)
    }
    return bytes {
      ascii("fLaC")
      write(block(0, false, 34))
      write(block(4, false, comment))
      write(block(1, true, padding))
      write(frames)
    }
  }

  private fun riffChunk(id: String, body: ByteArray) = bytes {
    ascii(id)
    le32(body.size.toLong())
    write(body)
    if (body.size % 2 == 1) write(0)
  }

  private fun wav(samples: ByteArray, list: Int): ByteArray {
    val body = bytes {
      ascii("WAVE")
      write(riffChunk("fmt ", ByteArray(16) { 1 }))
      if (list > 0) write(riffChunk("LIST", ByteArray(list) { 'i'.code.toByte() }))
      write(riffChunk("data", samples))
      write(riffChunk("id3 ", id3v2(list)))
    }
    return riffChunk("RIFF", body)
  }

  private fun mp4Box(kind: String, body: ByteArray) = bytes {
    be32(8L + body.size)
    ascii(kind)
    write(body)
  }

  private val m4aBrand = "M4A \u0000\u0000\u0000\u0000isom".toByteArray(Charsets.US_ASCII)
  private val dashBrand = "dash\u0000\u0000\u0000\u0000iso6".toByteArray(Charsets.US_ASCII)

  private fun m4a(samples: ByteArray, moov: Int) = bytes {
    write(mp4Box("ftyp", m4aBrand))
    write(mp4Box("moov", ByteArray(moov) { 'm'.code.toByte() }))
    write(mp4Box("mdat", samples))
  }

  private fun fragmentedM4a(fragments: List<ByteArray>, moov: Int) = bytes {
    write(mp4Box("ftyp", dashBrand))
    write(mp4Box("moov", ByteArray(moov) { 'm'.code.toByte() }))
    fragments.forEachIndexed { index, samples ->
      write(mp4Box("moof", ByteArray(24) { index.toByte() }))
      write(mp4Box("mdat", samples))
    }
    write(mp4Box("mfra", ByteArray(16)))
  }

  private fun hash(bytes: ByteArray) = ContentHash.of(Bytes(bytes))

  @Test
  fun matchesTheDesktopGoldenValues() {
    val fixtures = listOf(
      "mp3-small" to mp3(noise(1_000, 1), 100, listOf(id3v1("t"))) to
        "a1:b57fd2a7bed0c53da151da0c13927009b01f4e80575a952aaae172509dcec92c",
      "mp3-large" to mp3(noise(400_000, 2), 2_048, listOf(apev2(64), id3v1("t"))) to
        "a1:a69fe935670a1a8bc9ca3b4f009dc27ac58490c12e094ca93dfa58abe2c9bbcc",
      "flac" to flac(noise(500_000, 3), 200, 1_000) to
        "a1:1cfe53cdf2fbaf57dbd76439e3af500e2f08c8e19d2f66b5037a512594100b85",
      "wav" to wav(noise(300_001, 4), 50) to
        "a1:488f9e49523bd35c29e2545b125600c407de8f37e1871eedeacfc76d948a630b",
      "m4a" to m4a(noise(400_000, 5), 300) to
        "a1:b0341411322aaa9c6cbcc3353c80cda2f6141b9e6a03466b6433c6ae0063f8e1",
      "fragmented" to fragmentedM4a(listOf(noise(100_000, 6), noise(250_000, 7)), 64) to
        "a1:ee6078d995ed4212335b83b5ea11b96fabfad23a5933bb5dba81a4eb1ebf2103",
      "ogg" to bytes { ascii("OggS"); write(noise(200_000, 8)) } to
        "a1:9bc4a72a7f4ef1523854770c6bc35d9dca64bf9b43e6beb3e36b0b0b6d131242",
      "empty" to ByteArray(0) to
        "a1:5fb8f4d16b546abf1ab984ca306507b6d9b432448f6aa69eea24101f6140025e",
    )
    for ((named, expected) in fixtures) {
      val (name, file) = named
      assertEquals(name, expected, hash(file))
    }
  }

  @Test
  fun aRetaggedMp3KeepsItsHash() {
    val frames = noise(400_000, 9)
    val before = hash(mp3(frames, 100, emptyList()))
    val after = hash(mp3(frames, 4_000, listOf(apev2(300), id3v1("retagged"))))
    assertEquals(before, after)
  }
}
