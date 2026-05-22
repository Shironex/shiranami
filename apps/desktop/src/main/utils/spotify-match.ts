import type { SearchResult } from '@shiranami/contracts';

/**
 * A track as described by Spotify metadata (Web API or embed scrape). This is
 * the internal shape the matcher scores YouTube candidates against. Duration is
 * already in SECONDS here — the Spotify API returns `duration_ms`, so the
 * metadata source converts before constructing this. `durationSec` / `isrc`
 * are optional because the embed-scrape fallback cannot supply them.
 */
export interface SpotifyTrack {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  isrc?: string;
}

/** The chosen YouTube candidate plus its match quality for one Spotify track. */
export interface MatchResult {
  /** The winning candidate, or null when no candidates were supplied. */
  result: SearchResult | null;
  /** Normalized 0..1 score of the winner. */
  confidence: number;
  /** 'low' when the winner scored below CONFIDENCE_THRESHOLD. */
  flag: 'low' | 'ok';
}

/**
 * Below this normalized score the match is flagged 'low' so the renderer can
 * warn the user. We still import the best candidate (import-with-a-warning),
 * we never silently skip. 0.5 sits below a clean studio match (which lands well
 * above 0.7 once title + artist + duration align) but above the noise floor a
 * wrong-only candidate set produces.
 */
export const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Words that mark a YouTube upload as a non-original recording (live takes,
 * covers, edits, hour loops, full-album rips, reactions). A candidate whose
 * title carries one of these is penalized — UNLESS the Spotify track legitimately
 * carries the same word (e.g. a song actually titled "... - Live" or a remix
 * release), in which case the penalty is suppressed for that word.
 */
const FORBIDDEN_WORDS = [
  'live',
  'cover',
  'remix',
  'nightcore',
  'sped up',
  'sped-up',
  'speed up',
  'slowed',
  'reverb',
  '8d',
  'karaoke',
  'instrumental',
  'reaction',
  'react',
  'lesson',
  'tutorial',
  '1 hour',
  '1hour',
  'one hour',
  'hour loop',
  'hour version',
  'full album',
  'mashup',
  'parody',
] as const;

/** Each forbidden word present in a candidate title removes this much score. */
const FORBIDDEN_PENALTY = 0.15;

/** Hard duration gate: beyond this gap the duration score collapses fast. */
const DURATION_DECAY = 0.1;
/** Within this window duration is treated as effectively exact. */
const DURATION_EXACT_WINDOW_SEC = 4;

/**
 * Lowercase, strip diacritics, drop feat./with credits and all bracketed /
 * parenthetical noise, and collapse punctuation to spaces. Used for both title
 * and artist comparison so "Söng (Official Video) feat. X" and "song" align.
 */
export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/\s\b(?:feat\.?|ft\.?|featuring|with)\s+.*$/i, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Split a normalized string into a token set (empty tokens removed). */
function tokenSet(value: string): Set<string> {
  return new Set(value.split(' ').filter(Boolean));
}

/**
 * Token-overlap (Jaccard-style, recall-weighted) similarity in 0..1. We weight
 * by the smaller side so that a candidate title carrying extra promo words
 * ("official music video") is not unduly punished as long as it contains the
 * reference tokens.
 */
export function tokenSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const token of setA) {
    if (setB.has(token)) shared += 1;
  }
  return shared / Math.min(setA.size, setB.size);
}

/**
 * Duration similarity in 0..1 via exponential decay on the absolute gap in
 * seconds (spotDL's model). A candidate within DURATION_EXACT_WINDOW_SEC scores
 * 1.0; beyond that the score falls off quickly, which is what rejects the
 * live / remix / hour-mix / full-album cases. Returns a neutral 0.5 when the
 * Spotify duration is unknown (embed fallback) so duration neither helps nor
 * hurts.
 */
export function durationScore(spotifySec: number | undefined, candidateSec: number): number {
  if (!spotifySec || spotifySec <= 0 || !candidateSec || candidateSec <= 0) {
    return 0.5;
  }
  const delta = Math.abs(spotifySec - candidateSec);
  if (delta <= DURATION_EXACT_WINDOW_SEC) return 1;
  return Math.exp(-DURATION_DECAY * (delta - DURATION_EXACT_WINDOW_SEC));
}

/** True for YouTube auto-generated artist channels ("Artist - Topic"). */
export function isTopicChannel(uploader: string): boolean {
  return /-\s*topic$/i.test(uploader.trim());
}

/**
 * Count forbidden words present in `candidateTitle` that are NOT also present
 * in the Spotify track's own title/album. A word the Spotify side carries is a
 * legitimate descriptor (e.g. an official remix release), so it must not count
 * against the matching candidate.
 */
function forbiddenHitCount(candidateTitle: string, track: SpotifyTrack): number {
  const candidate = ` ${candidateTitle.toLowerCase()} `;
  const ownText = ` ${track.title.toLowerCase()} ${(track.album ?? '').toLowerCase()} `;

  let hits = 0;
  for (const word of FORBIDDEN_WORDS) {
    const padded = ` ${word} `;
    const inCandidate =
      candidate.includes(padded) ||
      candidate.includes(`(${word})`) ||
      candidate.includes(`[${word}]`);
    if (!inCandidate) continue;
    // Suppress the penalty if the Spotify metadata legitimately uses the word.
    if (ownText.includes(word)) continue;
    hits += 1;
  }
  return hits;
}

/**
 * Score one YouTube candidate against one Spotify track. Returns a normalized
 * 0..1 value. Weighting (before penalties): title 35%, artist 30%, duration
 * 35% — duration carries equal weight to title because it is the single
 * dimension that rejects live/remix/hour-mix mismatches. ISRC presence and a
 * Topic channel each add a small positive nudge; forbidden words subtract.
 */
export function scoreCandidate(track: SpotifyTrack, candidate: SearchResult): number {
  const refTitle = normalizeForMatch(track.title);
  const refArtist = normalizeForMatch(track.artist);
  const candTitle = normalizeForMatch(candidate.title);
  // YouTube channel ("uploader") doubles as the artist signal; Topic channels
  // are "Artist - Topic", and music videos embed the artist in the title too,
  // so compare the artist against both the channel and the candidate title.
  const candChannel = normalizeForMatch(candidate.uploader.replace(/-\s*topic$/i, ''));

  const titleScore = tokenSimilarity(refTitle, candTitle);
  const artistScore = Math.max(
    tokenSimilarity(refArtist, candChannel),
    tokenSimilarity(refArtist, candTitle)
  );
  const durScore = durationScore(track.durationSec, candidate.duration);

  let score = titleScore * 0.35 + artistScore * 0.3 + durScore * 0.35;

  // Forbidden-word penalty (suppressed for words the Spotify track owns).
  score -= forbiddenHitCount(candidate.title, track) * FORBIDDEN_PENALTY;

  // Small positive nudges — never enough to rescue a duration/title mismatch.
  if (isTopicChannel(candidate.uploader)) score += 0.05;
  if (track.isrc) score += 0.03;

  return Math.max(0, Math.min(1, score));
}

/**
 * Pick the best-scoring candidate for a Spotify track and report confidence.
 * Ties on score break toward the higher view count, then the Topic channel.
 * Returns `{ result: null }` only when no candidates were supplied; otherwise
 * always returns a winner (import-with-a-warning), flagging it 'low' when its
 * score is under CONFIDENCE_THRESHOLD.
 */
export function pickBestMatch(track: SpotifyTrack, candidates: SearchResult[]): MatchResult {
  if (candidates.length === 0) {
    return { result: null, confidence: 0, flag: 'low' };
  }

  let best: SearchResult | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const score = scoreCandidate(track, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
      continue;
    }
    if (score === bestScore && best) {
      const candViews = candidate.view_count ?? 0;
      const bestViews = best.view_count ?? 0;
      if (candViews > bestViews) {
        best = candidate;
      } else if (candViews === bestViews && isTopicChannel(candidate.uploader)) {
        best = candidate;
      }
    }
  }

  const confidence = Math.max(0, bestScore);
  return {
    result: best,
    confidence,
    flag: confidence >= CONFIDENCE_THRESHOLD ? 'ok' : 'low',
  };
}
