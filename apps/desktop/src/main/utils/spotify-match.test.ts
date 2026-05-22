import { describe, it, expect } from 'vitest';
import type { SearchResult } from '@shiranami/contracts';
import {
  normalizeForMatch,
  tokenSimilarity,
  durationScore,
  isTopicChannel,
  scoreCandidate,
  pickBestMatch,
  CONFIDENCE_THRESHOLD,
  type SpotifyTrack,
} from './spotify-match';

/** Build a SearchResult with sane defaults so each test sets only what matters. */
function candidate(overrides: Partial<SearchResult>): SearchResult {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    title: overrides.title ?? '',
    uploader: overrides.uploader ?? 'Some Channel',
    duration: overrides.duration ?? 0,
    thumbnail: '',
    url: '',
    webpage_url: '',
    view_count: overrides.view_count,
  };
}

describe('normalizeForMatch', () => {
  it('lowercases, strips parens/brackets and feat credits', () => {
    expect(normalizeForMatch('Söng Name (Official Video) feat. Someone')).toBe('song name');
  });

  it('collapses punctuation and whitespace', () => {
    expect(normalizeForMatch('A.B - C!!  D')).toBe('a b c d');
  });

  // V3 regression: "with" is a common preposition and must NOT be stripped.
  it('keeps "with" in song titles (V3 regression)', () => {
    expect(normalizeForMatch('Stay With Me')).toBe('stay with me');
    expect(normalizeForMatch('Walking with a Ghost')).toBe('walking with a ghost');
    expect(normalizeForMatch('Live With Me')).toBe('live with me');
  });
});

describe('tokenSimilarity', () => {
  it('is 1 for identical token sets', () => {
    expect(tokenSimilarity('hello world', 'world hello')).toBe(1);
  });

  it('is 0 for disjoint sets', () => {
    expect(tokenSimilarity('aaa bbb', 'ccc ddd')).toBe(0);
  });

  it('rewards full containment of the smaller side', () => {
    // reference fully contained in a noisier candidate title
    expect(tokenSimilarity('song name', 'song name official music video')).toBe(1);
  });
});

describe('durationScore', () => {
  it('is 1 inside the exact window', () => {
    expect(durationScore(200, 202)).toBe(1);
  });

  it('decays with the gap', () => {
    const near = durationScore(200, 210);
    const far = durationScore(200, 260);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeLessThan(0.1);
  });

  it('returns neutral 0.5 when Spotify duration is unknown', () => {
    expect(durationScore(undefined, 200)).toBe(0.5);
  });
});

describe('isTopicChannel', () => {
  it('detects auto-generated artist channels', () => {
    expect(isTopicChannel('Daft Punk - Topic')).toBe(true);
    expect(isTopicChannel('Some VEVO')).toBe(false);
  });
});

describe('scoreCandidate', () => {
  const track: SpotifyTrack = {
    title: 'Get Lucky',
    artist: 'Daft Punk',
    album: 'Random Access Memories',
    durationSec: 248,
    isrc: 'USQX91300108',
  };

  it('scores a clean studio match high', () => {
    const score = scoreCandidate(
      track,
      candidate({ title: 'Daft Punk - Get Lucky', uploader: 'Daft Punk - Topic', duration: 249 })
    );
    expect(score).toBeGreaterThan(0.8);
  });

  it('penalizes a forbidden-word candidate (live) with wrong duration', () => {
    const studio = scoreCandidate(
      track,
      candidate({ title: 'Daft Punk - Get Lucky', duration: 248 })
    );
    const live = scoreCandidate(
      track,
      candidate({ title: 'Get Lucky (Live at Coachella)', duration: 320 })
    );
    expect(studio).toBeGreaterThan(live);
  });

  it('does NOT penalize a forbidden word the Spotify track itself carries', () => {
    const remixTrack: SpotifyTrack = {
      title: 'Around the World - Radio Edit Remix',
      artist: 'Daft Punk',
      durationSec: 200,
    };
    const withWord = scoreCandidate(
      remixTrack,
      candidate({ title: 'Daft Punk - Around the World (Remix)', duration: 200 })
    );
    // The remix word is legitimate here, so the candidate stays high.
    expect(withWord).toBeGreaterThan(0.7);
  });
});

describe('forbiddenHitCount (via scoreCandidate)', () => {
  // V5 regression: "Alive" contains "live" as a substring but must NOT suppress
  // the live-penalty for a candidate that truly is a live recording.
  it('penalizes "Band - Live" even when Spotify track is titled "Alive" (V5 regression)', () => {
    const aliveTrack: SpotifyTrack = {
      title: 'Alive',
      artist: 'Pearl Jam',
      durationSec: 220,
    };
    const liveCandidateScore = scoreCandidate(
      aliveTrack,
      candidate({ title: 'Band - Live at the Garden', duration: 340 })
    );
    const studioScore = scoreCandidate(
      aliveTrack,
      candidate({ title: 'Pearl Jam - Alive', duration: 221 })
    );
    expect(studioScore).toBeGreaterThan(liveCandidateScore);
  });

  // V5 regression: a track whose own Spotify title is "... (Live)" must suppress
  // the live-penalty for a matching live candidate.
  it('does NOT penalize live candidate when Spotify track title legitimately contains "live" (V5 regression)', () => {
    const officialLiveTrack: SpotifyTrack = {
      title: 'Something in the Way (Live)',
      artist: 'Nirvana',
      durationSec: 230,
    };
    const scoreWithLive = scoreCandidate(
      officialLiveTrack,
      candidate({ title: 'Nirvana - Something in the Way (Live)', duration: 232 })
    );
    const scoreWithoutLive = scoreCandidate(
      officialLiveTrack,
      candidate({ title: 'Nirvana - Something in the Way', duration: 232 })
    );
    // Both should be similarly scored; the live word must not cause a penalty
    // when the Spotify track itself is the live release.
    expect(scoreWithLive).toBeGreaterThanOrEqual(scoreWithoutLive - 0.01);
  });

  // V5 regression: "Song - Remix" / "Song -Remix-" must register the remix penalty.
  it('penalizes "Song -Remix-" (adjacent punctuation, V5 regression)', () => {
    const studioTrack: SpotifyTrack = {
      title: 'Get Lucky',
      artist: 'Daft Punk',
      durationSec: 248,
    };
    const remixDashScore = scoreCandidate(
      studioTrack,
      candidate({ title: 'Get Lucky -Remix-', duration: 248 })
    );
    const cleanScore = scoreCandidate(
      studioTrack,
      candidate({ title: 'Daft Punk - Get Lucky', duration: 248 })
    );
    expect(cleanScore).toBeGreaterThan(remixDashScore);
  });
});

describe('pickBestMatch', () => {
  const track: SpotifyTrack = {
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    album: 'A Night at the Opera',
    durationSec: 354,
    isrc: 'GBUM71029604',
  };

  it('returns null result for an empty candidate list', () => {
    const match = pickBestMatch(track, []);
    expect(match.result).toBeNull();
    expect(match.flag).toBe('low');
  });

  it('original studio version beats live / cover / remix / nightcore / sped-up / hour-mix / full-album', () => {
    const original = candidate({
      id: 'original',
      title: 'Queen - Bohemian Rhapsody (Official Video)',
      uploader: 'Queen Official',
      duration: 355,
      view_count: 1_000_000,
    });
    const candidates: SearchResult[] = [
      candidate({
        id: 'live',
        title: 'Bohemian Rhapsody (Live Aid 1985)',
        uploader: 'Live Vids',
        duration: 360,
        view_count: 50_000_000,
      }),
      candidate({
        id: 'cover',
        title: 'Bohemian Rhapsody - Cover by SomeBand',
        uploader: 'SomeBand',
        duration: 350,
        view_count: 9_000_000,
      }),
      candidate({
        id: 'remix',
        title: 'Bohemian Rhapsody (EDM Remix)',
        uploader: 'RemixHub',
        duration: 240,
        view_count: 4_000_000,
      }),
      candidate({
        id: 'nightcore',
        title: 'Nightcore - Bohemian Rhapsody',
        uploader: 'NightcoreWorld',
        duration: 300,
        view_count: 3_000_000,
      }),
      candidate({
        id: 'spedup',
        title: 'Bohemian Rhapsody (Sped Up)',
        uploader: 'SpedUpSongs',
        duration: 300,
        view_count: 2_000_000,
      }),
      candidate({
        id: 'hourmix',
        title: 'Bohemian Rhapsody 1 Hour Loop',
        uploader: 'LoopChannel',
        duration: 3600,
        view_count: 8_000_000,
      }),
      candidate({
        id: 'album',
        title: 'Queen - A Night at the Opera (Full Album)',
        uploader: 'AlbumRips',
        duration: 2580,
        view_count: 1_500_000,
      }),
      original,
    ];

    const match = pickBestMatch(track, candidates);
    expect(match.result?.id).toBe('original');
    expect(match.flag).toBe('ok');
    expect(match.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });

  it('flags low confidence when only wrong candidates exist', () => {
    const wrongOnly: SearchResult[] = [
      candidate({
        id: 'live',
        title: 'Bohemian Rhapsody (Live Aid 1985)',
        uploader: 'Live Vids',
        duration: 480,
      }),
      candidate({
        id: 'hourmix',
        title: 'Bohemian Rhapsody 1 Hour Loop',
        uploader: 'LoopChannel',
        duration: 3600,
      }),
      candidate({
        id: 'album',
        title: 'Queen - A Night at the Opera (Full Album)',
        uploader: 'AlbumRips',
        duration: 2580,
      }),
    ];

    const match = pickBestMatch(track, wrongOnly);
    // Still imports the best candidate (never silently skips)...
    expect(match.result).not.toBeNull();
    // ...but flags it for the user to review.
    expect(match.flag).toBe('low');
    expect(match.confidence).toBeLessThan(CONFIDENCE_THRESHOLD);
  });

  it('breaks score ties toward higher view count', () => {
    const a = candidate({
      id: 'low-views',
      title: 'Queen - Bohemian Rhapsody',
      uploader: 'Queen - Topic',
      duration: 354,
      view_count: 100,
    });
    const b = candidate({
      id: 'high-views',
      title: 'Queen - Bohemian Rhapsody',
      uploader: 'Queen - Topic',
      duration: 354,
      view_count: 5_000_000,
    });
    const match = pickBestMatch(track, [a, b]);
    expect(match.result?.id).toBe('high-views');
  });

  it('still resolves a usable match when duration is unknown (embed fallback)', () => {
    const noDuration: SpotifyTrack = { title: 'Bohemian Rhapsody', artist: 'Queen' };
    const match = pickBestMatch(noDuration, [
      candidate({
        id: 'studio',
        title: 'Queen - Bohemian Rhapsody (Official Video)',
        uploader: 'Queen Official',
        duration: 355,
      }),
    ]);
    expect(match.result?.id).toBe('studio');
  });
});
