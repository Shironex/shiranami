/**
 * ICY (SHOUTcast/Icecast) stream metadata: pulling the frames back out of the
 * audio.
 *
 * Asking a station for metadata (`Icy-MetaData: 1`) changes the body. It stops
 * being audio and becomes audio interleaved with metadata blocks on a fixed
 * period, which the station reports in its `icy-metaint` response header: every
 * `metaint` bytes of audio are followed by one length byte, and a length of `n`
 * means `n * 16` bytes of metadata follow. `n === 0` — by far the common case,
 * since a song spans hundreds of periods — means the block is omitted.
 *
 * ```text
 *   |-- metaint bytes of audio --| 0 |-- metaint bytes of audio --| 2 | 32 bytes | ...
 * ```
 *
 * ## The one invariant
 *
 * **The audio bytes out are the audio bytes in.** The proxy previously declined
 * metadata (`Icy-MetaData: 0`) precisely so it would never have to do this: a
 * proxy that asks for metadata and forwards the body verbatim splices length
 * bytes and `StreamTitle='...'` text straight into the decoder's input, roughly
 * once a second, forever. That failure is silent where it is caused and audible
 * a long way away, as clicks. So this module is exactly a filter — remove the
 * frames, pass everything else through untouched.
 *
 * ## Chunk boundaries mean nothing
 *
 * A socket read boundary has no relationship to a `metaint` boundary. A chunk
 * can end mid-audio, exactly on the length byte, or halfway through a block —
 * all three happen in the first minute of a real stream. The position therefore
 * lives in the de-framer, not in the loop that feeds it, and the tests feed one
 * stream at a dozen chunk sizes to prove the output does not depend on how it
 * arrived.
 *
 * Mirrors `crates/shiranami-serve/src/icy/` (deframe.rs, title.rs), which is
 * the same algorithm for the Tauri stream server.
 */

/** Metadata lengths are counted in sixteen-byte units. */
const BLOCK_UNIT = 16;

/** The key whose value is the now-playing string. */
const STREAM_TITLE_KEY = 'StreamTitle=';

/** The separator the `Artist - Title` convention uses. */
const ARTIST_TITLE_SEPARATOR = ' - ';

/** What a station said it is playing. */
export interface IcyNowPlaying {
  /** The `StreamTitle` value exactly as it decoded. The source of truth. */
  raw: string;
  /** The part before the first ` - `, when there is one. */
  artist: string | null;
  /** The part after the first ` - `, when there is one. */
  title: string | null;
}

/** What one chunk of upstream body yielded. */
export interface IcyFrame {
  /**
   * The audio, with every metadata frame removed. May be empty when the chunk
   * was nothing but a block, which is legal and happens.
   */
  audio: Uint8Array;
  /** Titles that completed in this chunk, in arrival order. Usually empty. */
  titles: string[];
}

/**
 * The ICY metadata period a station granted, or null when it granted none.
 *
 * Null means the body is plain audio and must be forwarded untouched — a
 * station that ignored our request, one with nothing to send, or a header we
 * cannot make sense of. All three are ordinary.
 *
 * A zero is folded into null deliberately: it describes a period of no length,
 * and a de-framer counting down from zero would read every byte of audio as a
 * length prefix. That is silence, produced by a header no station thought was
 * load-bearing.
 */
export function parseMetaint(header: string | null): number | null {
  if (header === null) return null;
  const value = Number.parseInt(header.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Decode metadata bytes to a string without ever failing.
 *
 * ICY carries no encoding field. In practice a block is UTF-8, Latin-1, CP1251
 * or Shift-JIS depending on where the station is, and the strings are far too
 * short for detection to be anything but a coin flip.
 *
 * So valid UTF-8 is taken as UTF-8 — the overwhelmingly common case and the
 * only one identifiable for free — and anything else is read as Latin-1, where
 * every byte is a codepoint and decoding therefore cannot fail. A CP1251 title
 * comes out as mojibake rather than its intended glyphs, but it comes out in
 * full and the bytes are recoverable from it. A lossy UTF-8 decode would
 * instead collapse each undecodable run to one `U+FFFD` and destroy the content
 * permanently in exchange for looking tidier.
 */
export function decodeLenient(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

/** Drop the NUL padding a block is rounded up with, and surrounding space. */
function trimPadding(block: Uint8Array): Uint8Array {
  // NUL plus the five ASCII whitespace bytes, matching Rust's
  // `is_ascii_whitespace` so the two implementations trim identically.
  const isPadding = (byte: number): boolean =>
    byte === 0 || byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d;

  let start = 0;
  let end = block.length;
  while (start < end && isPadding(block[start] as number)) start += 1;
  while (end > start && isPadding(block[end - 1] as number)) end -= 1;
  return block.subarray(start, end);
}

/**
 * The value that follows `StreamTitle=`, with its quoting removed.
 *
 * The terminator is `';` rather than either character alone, because both occur
 * inside real titles — `Guns N' Roses`, and any station formatting a title as
 * `Artist; Album`. Ending on either alone truncates those. The two fallbacks
 * cover shapes that are common anyway: a station omitting the trailing `;` on
 * the last pair, and one omitting the quotes entirely.
 */
function unquote(rest: string): string {
  if (!rest.startsWith("'")) {
    const end = rest.indexOf(';');
    return end === -1 ? rest : rest.slice(0, end);
  }

  const quoted = rest.slice(1);
  const paired = quoted.indexOf("';");
  if (paired !== -1) return quoted.slice(0, paired);

  const last = quoted.lastIndexOf("'");
  // An unterminated quote: take the rest rather than dropping the title.
  return last === -1 ? quoted : quoted.slice(0, last);
}

/**
 * The `StreamTitle` in `block`, or null when it carries none worth showing.
 *
 * Null covers all of: no `StreamTitle` key, an empty value, and a value that is
 * nothing but whitespace — the three ways a station says "nothing to tell you",
 * which must never be rendered over the station name.
 */
export function streamTitle(block: Uint8Array): string | null {
  const text = decodeLenient(trimPadding(block));
  const at = text.indexOf(STREAM_TITLE_KEY);
  if (at === -1) return null;

  const value = unquote(text.slice(at + STREAM_TITLE_KEY.length)).trim();
  return value === '' ? null : value;
}

/**
 * Split a raw `StreamTitle` on the `Artist - Title` convention.
 *
 * A convention stations mostly follow and nothing enforces, so this is a guess
 * and is labelled as one: a station broadcasting an ident, a sponsor read or a
 * bare track name is not malformed. Splits on the first separator, so
 * `Artist - Title - Remix` keeps the remix with the title; a split that would
 * leave either side empty is discarded whole, because half a guess is worse
 * than none. The spaces in the separator matter — a bare hyphen is far more
 * often part of a name (`Jay-Z`, `Blink-182`) than a separator.
 */
export function nowPlayingFrom(raw: string): IcyNowPlaying {
  const at = raw.indexOf(ARTIST_TITLE_SEPARATOR);
  if (at === -1) return { raw, artist: null, title: null };

  const artist = raw.slice(0, at).trim();
  const title = raw.slice(at + ARTIST_TITLE_SEPARATOR.length).trim();
  if (artist === '' || title === '') return { raw, artist: null, title: null };

  return { raw, artist, title };
}

/** Where in the interleave pattern the next byte falls. */
type State =
  | { kind: 'audio'; left: number }
  | { kind: 'length' }
  | { kind: 'metadata'; remaining: number; block: Uint8Array; filled: number };

/**
 * The de-framer for one connection.
 *
 * A position in a byte stream, so one instance belongs to one response body and
 * must not be shared: two holders would each advance it past the other's bytes.
 */
export class IcyDeframer {
  private state: State;

  /**
   * The last title emitted, so a station repeating itself every period does not
   * wake the renderer every period. Stations do this constantly — the block is
   * re-sent on a timer, not on a change.
   */
  private last: string | null = null;

  constructor(private readonly metaint: number) {
    this.state = { kind: 'audio', left: metaint };
  }

  /** Feed one chunk of upstream body; take the audio and any new titles. */
  push(chunk: Uint8Array): IcyFrame {
    // The overwhelmingly common chunk: entirely audio, no boundary in it.
    // Returned as the very buffer it arrived in, so the ordinary path copies
    // nothing and cannot alter a byte it does not touch.
    if (this.state.kind === 'audio' && this.state.left >= chunk.length) {
      this.state = { kind: 'audio', left: this.state.left - chunk.length };
      return { audio: chunk, titles: [] };
    }

    const audio = new Uint8Array(chunk.length);
    let written = 0;
    const titles: string[] = [];
    let cursor = 0;

    while (cursor < chunk.length) {
      const rest = chunk.subarray(cursor);
      const taken = this.step(rest, audio, written, titles);
      written += taken.wrote;
      cursor += taken.consumed;
    }

    return { audio: audio.subarray(0, written), titles };
  }

  /**
   * Consume as much of `rest` as the current state wants.
   *
   * Always consumes at least one byte for a non-empty `rest`, which is what
   * stops {@link push}'s loop from spinning.
   */
  private step(
    rest: Uint8Array,
    audio: Uint8Array,
    written: number,
    titles: string[]
  ): { consumed: number; wrote: number } {
    const state = this.state;

    if (state.kind === 'audio') {
      const taken = Math.min(state.left, rest.length);
      audio.set(rest.subarray(0, taken), written);
      const left = state.left - taken;
      this.state = left === 0 ? { kind: 'length' } : { kind: 'audio', left };
      return { consumed: taken, wrote: taken };
    }

    if (state.kind === 'length') {
      const bytes = (rest[0] as number) * BLOCK_UNIT;
      this.state =
        bytes === 0
          ? // The common case by a wide margin: nothing changed this period.
            { kind: 'audio', left: this.metaint }
          : { kind: 'metadata', remaining: bytes, block: new Uint8Array(bytes), filled: 0 };
      return { consumed: 1, wrote: 0 };
    }

    const taken = Math.min(state.remaining, rest.length);
    state.block.set(rest.subarray(0, taken), state.filled);
    const filled = state.filled + taken;
    const remaining = state.remaining - taken;

    if (remaining > 0) {
      this.state = { ...state, remaining, filled };
      return { consumed: taken, wrote: 0 };
    }

    this.state = { kind: 'audio', left: this.metaint };
    const title = this.freshTitle(state.block);
    if (title !== null) titles.push(title);
    return { consumed: taken, wrote: 0 };
  }

  /**
   * Parse a completed block, applying the repeat debounce.
   *
   * Null covers both "the block named no title" and "it named the one already
   * showing" — from the caller's side those are the same thing.
   */
  private freshTitle(block: Uint8Array): string | null {
    const title = streamTitle(block);
    if (title === null || title === this.last) return null;
    this.last = title;
    return title;
  }
}
