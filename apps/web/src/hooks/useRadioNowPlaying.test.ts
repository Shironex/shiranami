import { describe, expect, it } from 'vitest';
import type { RadioNowPlaying } from '@shiranami/contracts';
import type { Track } from '@/stores/types';
import { belongsToCurrent, radioStreamUrl, radioTitleFor } from './useRadioNowPlaying';

const STREAM = 'http://stream.example.com/live?x=1&y=2';

function radioTrack(streamUrl = STREAM): Track {
  return {
    id: 'radio:abc',
    title: 'Groove Salad',
    artist: 'Live Radio',
    album: 'US · MP3 · 128kbps',
    duration: 0,
    filePath: `shiranami-radio://stream?url=${encodeURIComponent(streamUrl)}`,
  };
}

function libraryTrack(): Track {
  return {
    id: 'track-1',
    title: 'Midnight Tapes',
    artist: 'Idealism',
    album: 'Late Nights',
    duration: 215,
    filePath: '/music/test.mp3',
  };
}

function playing(raw: string, streamUrl = STREAM): RadioNowPlaying {
  return { streamUrl, raw, artist: null, title: null };
}

describe('radioStreamUrl', () => {
  // The proxy percent-decodes the parameter, so the event carries the decoded
  // URL; decoding here is what puts the two spellings on the same footing.
  it('recovers the decoded upstream URL from a radio filePath', () => {
    expect(radioStreamUrl(radioTrack().filePath)).toBe(STREAM);
  });

  it('is null for anything that is not one of our radio paths', () => {
    expect(radioStreamUrl('/music/test.mp3')).toBeNull();
    expect(radioStreamUrl('shiranami-radio://lofi')).toBeNull();
    expect(radioStreamUrl('shiranami-radio://stream?url=%E0%A4%A')).toBeNull();
  });
});

describe('belongsToCurrent', () => {
  it('accepts an event for the station that is playing', () => {
    expect(belongsToCurrent(radioTrack().filePath, playing('Cornelius - Drop'))).toBe(true);
  });

  // The station the user just left keeps emitting until its proxy connection
  // drains. Letting one of those into the store is worse than dropping it: the
  // de-framer only emits on a *change*, so the new station would not re-send
  // its own title until its song ends.
  it('rejects an event from the station the user has just left', () => {
    const stale = playing('Old Song', 'http://other.example.com/live');
    expect(belongsToCurrent(radioTrack().filePath, stale)).toBe(false);
  });

  it('rejects an event while a library track or nothing is playing', () => {
    expect(belongsToCurrent(libraryTrack().filePath, playing('Cornelius - Drop'))).toBe(false);
    expect(belongsToCurrent(null, playing('Cornelius - Drop'))).toBe(false);
  });
});

describe('radioTitleFor', () => {
  it('shows the station title once one has arrived', () => {
    expect(radioTitleFor(radioTrack(), playing('Cornelius - Drop'))).toBe('Cornelius - Drop');
  });

  // Every "we do not know yet" case must leave the station name on screen. A
  // title that blinks in and out is worse than one that never appears.
  it('falls back to the station name when there is no title', () => {
    expect(radioTitleFor(radioTrack(), null)).toBe('Groove Salad');
    expect(radioTitleFor(radioTrack(), playing(''))).toBe('Groove Salad');
    expect(radioTitleFor(radioTrack(), playing('   '))).toBe('Groove Salad');
  });

  // Without the stream-URL check, switching stations shows the previous one's
  // song until the new one's first block lands.
  it('ignores a title belonging to a station the user has left', () => {
    const stale = playing('Old Song', 'http://other.example.com/live');
    expect(radioTitleFor(radioTrack(), stale)).toBe('Groove Salad');
  });

  it('leaves a library track alone even while a radio title is in the store', () => {
    expect(radioTitleFor(libraryTrack(), playing('Cornelius - Drop'))).toBe('Midnight Tapes');
  });

  // Station metadata is full of blackletter and mathematical alphanumerics.
  // NFKC folds them to letters the UI font can actually render.
  it('folds fancy-font codepoints to plain text', () => {
    // Fraktur "lofi" — the shape a chill-out station puts in its ident.
    expect(radioTitleFor(radioTrack(), playing('\u{1D529}\u{1D52C}\u{1D523}\u{1D526}'))).toBe(
      'lofi'
    );
    expect(radioTitleFor(radioTrack(), playing('\u{1D400}\u{1D401}\u{1D402}'))).toBe('ABC');
    expect(radioTitleFor(radioTrack(), playing('ＡＢＣ'))).toBe('ABC');
  });

  // The fold must not damage ordinary text, which is the far more common case.
  it('leaves ordinary and non-Latin text untouched', () => {
    expect(radioTitleFor(radioTrack(), playing('サカナクション - 新宝島'))).toBe(
      'サカナクション - 新宝島'
    );
    expect(radioTitleFor(radioTrack(), playing("Guns N' Roses - Patience"))).toBe(
      "Guns N' Roses - Patience"
    );
  });
});
