import { describe, expect, it } from 'vitest';
import { IcyDeframer, decodeLenient, nowPlayingFrom, parseMetaint, streamTitle } from './icy';

const METAINT = 64;

/** A metadata block body, NUL-padded to a multiple of sixteen. */
function padded(body: string): Uint8Array {
  const bytes = Array.from(Buffer.from(body, 'utf8'));
  while (bytes.length % 16 !== 0) bytes.push(0);
  return Uint8Array.from(bytes);
}

/** One block as a station sends it: the length byte, then the padded text. */
function framed(body: string): Uint8Array {
  const block = padded(body);
  return Uint8Array.from([block.length / 16, ...block]);
}

/** `n` bytes of recognisable pseudo-audio. */
function pcm(n: number, seed: number): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i % 251) + (seed % 5));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Feed `stream` to a fresh de-framer in chunks of `size`. */
function run(stream: Uint8Array, size: number): { audio: Uint8Array; titles: string[] } {
  const deframer = new IcyDeframer(METAINT);
  const pieces: Uint8Array[] = [];
  const titles: string[] = [];
  for (let at = 0; at < stream.length; at += size) {
    const frame = deframer.push(stream.subarray(at, Math.min(at + size, stream.length)));
    pieces.push(frame.audio);
    titles.push(...frame.titles);
  }
  return { audio: concat(...pieces), titles };
}

describe('parseMetaint', () => {
  it('reads a granted period and tolerates padding', () => {
    expect(parseMetaint('16000')).toBe(16000);
    expect(parseMetaint('  16000 ')).toBe(16000);
  });

  // Each of these must leave the body untouched rather than start a de-framer
  // against a period that is not there.
  it('refuses an absent or useless header', () => {
    expect(parseMetaint(null)).toBeNull();
    expect(parseMetaint('0')).toBeNull();
    expect(parseMetaint('banana')).toBeNull();
    expect(parseMetaint('-16000')).toBeNull();
  });
});

describe('streamTitle', () => {
  it('parses the ordinary shape', () => {
    expect(streamTitle(padded("StreamTitle='Cornelius - Drop';"))).toBe('Cornelius - Drop');
  });

  it('ignores a second pair after the title', () => {
    const block = padded("StreamTitle='Cornelius - Drop';StreamUrl='http://example.com';");
    expect(streamTitle(block)).toBe('Cornelius - Drop');
  });

  // StreamUrl-first is a real ordering, and a scan assuming the title came
  // first would return the URL.
  it('finds the title wherever it sits', () => {
    expect(streamTitle(padded("StreamUrl='http://example.com';StreamTitle='Drop';"))).toBe('Drop');
  });

  it('keeps a quote inside the title', () => {
    expect(streamTitle(padded("StreamTitle='Guns N' Roses - Patience';"))).toBe(
      "Guns N' Roses - Patience"
    );
  });

  it('keeps a semicolon inside the title', () => {
    expect(streamTitle(padded("StreamTitle='Artist; Album - Track';"))).toBe(
      'Artist; Album - Track'
    );
  });

  it('parses a value with no trailing semicolon', () => {
    expect(streamTitle(padded("StreamTitle='Drop'"))).toBe('Drop');
  });

  it('parses an unquoted value', () => {
    expect(streamTitle(padded('StreamTitle=Drop;'))).toBe('Drop');
    expect(streamTitle(padded('StreamTitle=Drop'))).toBe('Drop');
  });

  it('keeps what there is of an unterminated quote', () => {
    expect(streamTitle(padded("StreamTitle='Drop"))).toBe('Drop');
  });

  // The three ways a station says "nothing", all of which must leave the
  // station name on screen rather than blanking it.
  it('treats an empty or absent title as no title', () => {
    expect(streamTitle(padded("StreamTitle='';"))).toBeNull();
    expect(streamTitle(padded("StreamTitle='   ';"))).toBeNull();
    expect(streamTitle(padded("StreamUrl='http://x';"))).toBeNull();
    expect(streamTitle(new Uint8Array(0))).toBeNull();
    expect(streamTitle(new Uint8Array(16))).toBeNull();
  });

  it('decodes UTF-8 as UTF-8', () => {
    expect(streamTitle(padded("StreamTitle='サカナクション - 新宝島';"))).toBe(
      'サカナクション - 新宝島'
    );
  });

  // A Latin-1 block is not valid UTF-8 and must come back whole rather than as
  // replacement characters.
  it('decodes non-UTF-8 bytes as Latin-1 rather than dropping them', () => {
    const bytes = Uint8Array.from([
      ...Buffer.from("StreamTitle='Bj", 'utf8'),
      0xf6, // 'ö' in Latin-1
      ...Buffer.from("rk - Joga';", 'utf8'),
    ]);
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();
    expect(streamTitle(bytes)).toBe('Björk - Joga');
  });

  // CP1251 comes out as mojibake, and that is the recorded behaviour rather
  // than an oversight: it is intact, and U+FFFD would not be.
  it('preserves an undetectable encoding as mojibake rather than replacement chars', () => {
    const bytes = Uint8Array.from([
      ...Buffer.from("StreamTitle='", 'utf8'),
      0xcc,
      0xf3,
      0xe7,
      0xfb,
      0xea,
      0xe0, // "Музыка" in CP1251
      ...Buffer.from("';", 'utf8'),
    ]);
    const parsed = streamTitle(bytes);
    expect(parsed).not.toBeNull();
    expect(parsed).not.toContain('�');
    expect([...(parsed as string)]).toHaveLength(6);
  });

  // Every byte sequence is a legal input, so the parser is walked over broken
  // ones purely to prove none can throw.
  it('never throws on a malformed block', () => {
    const corpus = [
      Buffer.from('StreamTitle='),
      Buffer.from("StreamTitle='"),
      Buffer.from("StreamTitle=';"),
      Buffer.from("';';';"),
      Buffer.from('StreamTitle'),
      new Uint8Array(32).fill(0xff),
      new Uint8Array(4080),
      Uint8Array.from([0xc3]), // a truncated UTF-8 lead byte
    ];
    for (const bytes of corpus) {
      expect(() => streamTitle(new Uint8Array(bytes))).not.toThrow();
    }
  });
});

describe('decodeLenient', () => {
  it('never throws', () => {
    expect(() => decodeLenient(Uint8Array.from([0xff, 0xfe, 0x00]))).not.toThrow();
  });
});

describe('nowPlayingFrom', () => {
  it('splits the conventional shape', () => {
    expect(nowPlayingFrom('Cornelius - Drop')).toEqual({
      raw: 'Cornelius - Drop',
      artist: 'Cornelius',
      title: 'Drop',
    });
  });

  // A station ident is not malformed and must survive as itself.
  it('keeps only the raw when there is no separator', () => {
    expect(nowPlayingFrom('SomaFM Groove Salad')).toEqual({
      raw: 'SomaFM Groove Salad',
      artist: null,
      title: null,
    });
  });

  // The hyphen inside a name is not a separator, which is why the separator
  // carries its spaces.
  it('does not split a hyphenated name', () => {
    expect(nowPlayingFrom('Blink-182').artist).toBeNull();
  });

  it('splits on the first separator only', () => {
    expect(nowPlayingFrom('Artist - Title - Remix')).toEqual({
      raw: 'Artist - Title - Remix',
      artist: 'Artist',
      title: 'Title - Remix',
    });
  });

  it('discards a half-empty split', () => {
    for (const raw of [' - Title', 'Artist - ', ' - ']) {
      expect(nowPlayingFrom(raw).artist).toBeNull();
      expect(nowPlayingFrom(raw).title).toBeNull();
    }
  });
});

describe('IcyDeframer', () => {
  it('passes audio with no blocks through unchanged', () => {
    const stream = pcm(METAINT, 0);
    const { audio, titles } = run(stream, METAINT);
    expect(audio).toEqual(stream);
    expect(titles).toEqual([]);
  });

  // The fast path must hand back the very same buffer, not a copy — that is
  // what makes "byte-identical" true by construction.
  it('does not copy a chunk that is entirely audio', () => {
    const deframer = new IcyDeframer(METAINT);
    const chunk = pcm(10, 0);
    expect(deframer.push(chunk).audio).toBe(chunk);
  });

  it('costs one byte and no title for a zero-length block', () => {
    const stream = concat(pcm(METAINT, 0), Uint8Array.from([0]), pcm(METAINT, 1));
    const { audio, titles } = run(stream, 4096);
    expect(audio).toEqual(concat(pcm(METAINT, 0), pcm(METAINT, 1)));
    expect(titles).toEqual([]);
  });

  it('strips a block and surfaces its title', () => {
    const stream = concat(
      pcm(METAINT, 0),
      framed("StreamTitle='Cornelius - Drop';"),
      pcm(METAINT, 1)
    );
    const { audio, titles } = run(stream, 4096);
    expect(audio).toEqual(concat(pcm(METAINT, 0), pcm(METAINT, 1)));
    expect(titles).toEqual(['Cornelius - Drop']);
  });

  // The whole reason the state lives in the de-framer. Every chunk size is a
  // different set of split points — through the length byte, through the block,
  // through both — and all must produce the same bytes.
  it('produces the same output however the stream was chunked', () => {
    const stream = concat(
      pcm(METAINT, 0),
      framed("StreamTitle='One';"),
      pcm(METAINT, 1),
      Uint8Array.from([0]),
      pcm(METAINT, 2),
      framed("StreamTitle='Two';"),
      pcm(METAINT, 3)
    );
    const expected = concat(pcm(METAINT, 0), pcm(METAINT, 1), pcm(METAINT, 2), pcm(METAINT, 3));

    for (const size of [1, 2, 3, 7, 16, 17, 31, 63, 64, 65, 127, 4096]) {
      const { audio, titles } = run(stream, size);
      expect(audio, `audio differed at chunk size ${size}`).toEqual(expected);
      expect(titles, `titles differed at chunk size ${size}`).toEqual(['One', 'Two']);
    }
  });

  // The specific split the task calls out. Asserted on its own as well as in
  // the sweep above, because it is the failure that corrupts audio rather than
  // merely losing a title.
  it('reassembles a block split across two reads', () => {
    const stream = concat(
      pcm(METAINT, 0),
      framed("StreamTitle='Split - Across';"),
      pcm(METAINT, 1)
    );
    const cut = METAINT + 1 + 16;

    const deframer = new IcyDeframer(METAINT);
    const first = deframer.push(stream.subarray(0, cut));
    const second = deframer.push(stream.subarray(cut));

    expect(first.titles).toEqual([]);
    expect(second.titles).toEqual(['Split - Across']);
    expect(concat(first.audio, second.audio)).toEqual(concat(pcm(METAINT, 0), pcm(METAINT, 1)));
  });

  // Stations re-send the block on a timer, not on a change, so the same title
  // arrives every period for the length of the song.
  it('emits a repeated title once', () => {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < 4; i += 1) {
      parts.push(pcm(METAINT, i), framed("StreamTitle='Same';"));
    }
    expect(run(concat(...parts), 4096).titles).toEqual(['Same']);
  });

  // The debounce is on the previous title only: A, B, A is a rotation, and
  // collapsing it would strand the display.
  it('emits a title again when it comes back after another', () => {
    const parts: Uint8Array[] = [];
    for (const name of ['A', 'B', 'A']) {
      parts.push(pcm(METAINT, 0), framed(`StreamTitle='${name}';`));
    }
    expect(run(concat(...parts), 4096).titles).toEqual(['A', 'B', 'A']);
  });

  // Losing a title is fine; leaving its bytes in the stream is not.
  it('strips an unparseable block anyway', () => {
    const stream = concat(
      pcm(METAINT, 0),
      framed("StreamUrl='http://example.com';"),
      pcm(METAINT, 1)
    );
    const { audio, titles } = run(stream, 4096);
    expect(audio).toEqual(concat(pcm(METAINT, 0), pcm(METAINT, 1)));
    expect(titles).toEqual([]);
  });

  // A block still open when the station hangs up leaves the de-framer
  // mid-state. Nothing must be flushed as audio from it.
  it('yields no stray audio from a truncated final block', () => {
    const block = framed("StreamTitle='Never finished';");
    const stream = concat(pcm(METAINT, 0), block.subarray(0, block.length - 4));
    const { audio, titles } = run(stream, 4096);
    expect(audio).toEqual(pcm(METAINT, 0));
    expect(titles).toEqual([]);
  });

  // The maximum a length byte can describe: bounded by the format at 4080
  // bytes, which is why the block buffer needs no cap of its own.
  it('handles the largest possible block', () => {
    const body = `StreamTitle='${'x'.repeat(4000)}';`;
    const stream = concat(pcm(METAINT, 0), framed(body), pcm(METAINT, 1));
    const { audio, titles } = run(stream, 512);
    expect(audio).toEqual(concat(pcm(METAINT, 0), pcm(METAINT, 1)));
    expect(titles).toHaveLength(1);
    expect(titles[0]).toHaveLength(4000);
  });
});
