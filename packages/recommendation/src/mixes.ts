/**
 * Smart-mix generation. Turns the contextual signals the Overview already
 * collects (time-of-day + current weather) plus library metadata (year, genre)
 * into mood / activity / decade mixes — e.g. "Focus", "Late-night",
 * "Rainy-day", "Best of the 2010s".
 *
 * Pure and deterministic: callers inject the `hour` and optional `weather`, so
 * the same library + signals always yields the same mixes (and the desktop
 * adapter / unit tests can score against a fixed "as of" context). The desktop
 * recommendation service projects the `tracks` table into {@link MixTrack} and
 * resolves the returned track ids; the renderer renders the descriptors.
 *
 * No DB, no IPC, no Electron — same contract as the rest of this package.
 */

/** Minimal library shape for mix generation — the metadata axes a mix filters
 *  on, plus the play count used to order picks within a mix. */
export interface MixTrack {
  trackId: string;
  /** Free-text genre tag, possibly null/empty (sparse in this schema). */
  genre: string | null;
  /** Release year, possibly null (drives the decade mixes). */
  year: number | null;
  /** Lifetime play count, used to rank picks within a mix (popular first). */
  playCount: number;
}

/** Coarse weather buckets the rain/clear-driven mixes key off. Mirrors the
 *  Open-Meteo `WeatherCondition` union without importing contracts (keeps the
 *  package dependency-free); the adapter maps one to the other. */
export type MixWeather =
  | 'clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'fog'
  | 'unknown';

/** Contextual signals that select which mood/activity mixes are generated. */
export interface MixSignals {
  /** Local hour 0–23. Drives the time-of-day mixes (Late-night, Morning…). */
  hour: number;
  /** Current weather, when the user opted into it; otherwise omitted. */
  weather?: MixWeather;
}

/** Stable kinds so the renderer can pick an icon and a localized label key. */
export type SmartMixKind =
  | 'focus'
  | 'late-night'
  | 'morning'
  | 'rainy-day'
  | 'sunny-day'
  | 'snowy-day'
  | 'decade';

/**
 * One generated mix. `id` is stable per render (kind + optional decade) so the
 * renderer can key on it; `titleKey` / `descKey` resolve against the `mixes`
 * i18n namespace; `decade` is set only for `kind === 'decade'` (e.g. 2010).
 */
export interface SmartMix {
  id: string;
  kind: SmartMixKind;
  titleKey: string;
  descKey: string;
  /** Decade start year for `kind === 'decade'` (e.g. 1990, 2000, 2010). */
  decade?: number;
  /** Ranked track ids in the mix (most-played first), capped at the limit. */
  trackIds: string[];
}

/** Max tracks per generated mix — matches the static mixes' MIX_LIMIT. */
export const SMART_MIX_LIMIT = 50;
/** A mix must have at least this many tracks to be surfaced (no near-empty
 *  shelves). */
const MIN_MIX_SIZE = 5;
/** Most recent N decades to consider, newest first, to avoid a long tail of
 *  tiny single-track decades. */
const MAX_DECADES = 3;

/** Lower-cased genre substrings that read as "calm / instrumental / focus". */
const FOCUS_GENRES = ['lofi', 'lo-fi', 'instrumental', 'ambient', 'classical', 'jazz', 'chill'];
/** Genres that read as "energetic / upbeat" for the sunny-day mix. */
const UPBEAT_GENRES = ['pop', 'dance', 'electronic', 'rock', 'house', 'funk', 'disco'];

function genreMatches(track: MixTrack, needles: string[]): boolean {
  const g = track.genre?.toLowerCase() ?? '';
  if (!g) return false;
  return needles.some(needle => g.includes(needle));
}

/** Rank by play count desc (ties keep input order, which is stable) and cap. */
function rankAndCap(tracks: MixTrack[]): string[] {
  return [...tracks]
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, SMART_MIX_LIMIT)
    .map(track => track.trackId);
}

/** Build a non-decade mix from a predicate; returns null if too small. */
function buildMix(
  kind: SmartMixKind,
  titleKey: string,
  descKey: string,
  tracks: MixTrack[],
  predicate: (track: MixTrack) => boolean
): SmartMix | null {
  const matched = tracks.filter(predicate);
  if (matched.length < MIN_MIX_SIZE) return null;
  return { id: kind, kind, titleKey, descKey, trackIds: rankAndCap(matched) };
}

/** Decade start year for a release year (1994 → 1990); null when unknown. */
function decadeOf(year: number | null): number | null {
  if (year == null || !Number.isFinite(year) || year < 1000) return null;
  return Math.floor(year / 10) * 10;
}

/**
 * Generate the decade mixes — one per decade with enough tracks, newest first,
 * limited to {@link MAX_DECADES}. Each is ranked by play count.
 */
function buildDecadeMixes(tracks: MixTrack[]): SmartMix[] {
  const byDecade = new Map<number, MixTrack[]>();
  for (const track of tracks) {
    const decade = decadeOf(track.year);
    if (decade == null) continue;
    const bucket = byDecade.get(decade);
    if (bucket) bucket.push(track);
    else byDecade.set(decade, [track]);
  }

  return [...byDecade.entries()]
    .filter(([, bucket]) => bucket.length >= MIN_MIX_SIZE)
    .sort((a, b) => b[0] - a[0])
    .slice(0, MAX_DECADES)
    .map(([decade, bucket]) => ({
      id: `decade-${decade}`,
      kind: 'decade' as const,
      titleKey: 'smart.decade',
      descKey: 'smart.decadeDesc',
      decade,
      trackIds: rankAndCap(bucket),
    }));
}

/**
 * Generate the contextual mood/activity mixes for the given signals, plus the
 * decade mixes. Mixes that don't reach {@link MIN_MIX_SIZE} are dropped so the
 * UI never shows a near-empty shelf. The order is: the single most-relevant
 * time/weather mix first, then the remaining contextual mixes, then decades.
 *
 * Degrades gracefully: with no weather signal, only the time-of-day + decade
 * mixes are produced; with no usable metadata at all, returns `[]`.
 */
export function buildSmartMixes(tracks: readonly MixTrack[], signals: MixSignals): SmartMix[] {
  const all = tracks as MixTrack[];
  const hour = Number.isFinite(signals.hour) ? signals.hour : 12;
  const isLateNight = hour >= 22 || hour < 5;
  const isMorning = hour >= 5 && hour < 12;

  const candidates: Array<SmartMix | null> = [];

  // Time-of-day mood mixes.
  if (isLateNight) {
    candidates.push(
      buildMix('late-night', 'smart.lateNight', 'smart.lateNightDesc', all, track =>
        genreMatches(track, FOCUS_GENRES)
      )
    );
  }
  if (isMorning) {
    candidates.push(
      buildMix('morning', 'smart.morning', 'smart.morningDesc', all, track =>
        genreMatches(track, UPBEAT_GENRES)
      )
    );
  }

  // Focus / activity mix — always offered (calm, instrumental picks).
  candidates.push(
    buildMix('focus', 'smart.focus', 'smart.focusDesc', all, track =>
      genreMatches(track, FOCUS_GENRES)
    )
  );

  // Weather-driven mixes (only when a signal is present).
  switch (signals.weather) {
    case 'rain':
    case 'thunderstorm':
    case 'fog':
      candidates.push(
        buildMix('rainy-day', 'smart.rainyDay', 'smart.rainyDayDesc', all, track =>
          genreMatches(track, FOCUS_GENRES)
        )
      );
      break;
    case 'snow':
      candidates.push(
        buildMix('snowy-day', 'smart.snowyDay', 'smart.snowyDayDesc', all, track =>
          genreMatches(track, FOCUS_GENRES)
        )
      );
      break;
    case 'clear':
    case 'partly_cloudy':
      candidates.push(
        buildMix('sunny-day', 'smart.sunnyDay', 'smart.sunnyDayDesc', all, track =>
          genreMatches(track, UPBEAT_GENRES)
        )
      );
      break;
    default:
      break;
  }

  // Dedupe by kind (a focus + late-night mix can collide on the same picks; the
  // first/most-relevant wins) and drop the nulls.
  const seen = new Set<SmartMixKind>();
  const mixes: SmartMix[] = [];
  for (const mix of candidates) {
    if (!mix || seen.has(mix.kind)) continue;
    seen.add(mix.kind);
    mixes.push(mix);
  }

  mixes.push(...buildDecadeMixes(all));
  return mixes;
}
