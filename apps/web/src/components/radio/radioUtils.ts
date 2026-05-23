import type { Track } from '@/stores/types';
import type { Station } from 'radio-browser-api';

export function stationToTrack(station: Station, liveRadioLabel: string): Track {
  const streamUrl = station.urlResolved || station.url;
  const tagsStr = Array.isArray(station.tags) ? station.tags.join(', ') : '';
  return {
    id: `radio:${station.id}`,
    title: station.name,
    artist: liveRadioLabel,
    album: [station.country, station.codec, station.bitrate ? `${station.bitrate}kbps` : '']
      .filter(Boolean)
      .join(' · '),
    duration: 0,
    filePath: `shiranami-radio://stream?url=${encodeURIComponent(streamUrl)}`,
    albumArt: station.favicon || undefined,
    genre: tagsStr.split(',')[0]?.trim() || null,
  };
}

const REGIONAL_INDICATOR_OFFSET = 0x1f1e6;
const CHAR_CODE_A = 65; // 'A'

/**
 * Maps an ISO 3166-1 alpha-2 country code to its flag emoji by pairing the two
 * regional-indicator symbols. Pure derivation that works for every valid code,
 * replacing the old hardcoded 15-entry flag table. Returns an empty string for
 * anything that is not a two-letter A-Z code.
 */
export function isoCodeToFlag(code: string): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  let flag = '';
  for (let i = 0; i < 2; i += 1) {
    const charCode = upper.charCodeAt(i);
    if (charCode < CHAR_CODE_A || charCode > CHAR_CODE_A + 25) return '';
    flag += String.fromCodePoint(REGIONAL_INDICATOR_OFFSET + (charCode - CHAR_CODE_A));
  }
  return flag;
}

/**
 * Resolves the human-readable country name for an ISO-2 code in the given UI
 * language, falling back to the code itself when the platform cannot resolve a
 * name. Used to label the dynamic country list with full names instead of bare
 * codes.
 */
export function countryNameFromCode(code: string, language: string): string {
  if (!code) return '';
  try {
    const display = new Intl.DisplayNames([language], { type: 'region' });
    return display.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * Title-cases a radio-browser language or tag name for display. The API returns
 * these lowercased (e.g. "drum and bass"), so each word is capitalized.
 */
export function titleCase(value: string): string {
  return value.replace(
    /(^|[^\p{L}\p{N}_])(\p{L})/gu,
    (_, prefix, char) => `${prefix}${char.toUpperCase()}`
  );
}

/**
 * Derives the user's country as an ISO 3166-1 alpha-2 code from the browser /
 * Electron locale (e.g. "en-US" -> "US", "pl-PL" -> "PL"). This backs the
 * "Near you" shortcut: it is a locale-country filter, not GPS proximity.
 * Returns null when the locale carries no region subtag (e.g. bare "en").
 */
export function localeCountryCode(): string | null {
  const candidates: string[] = [];
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
    if (navigator.language) candidates.push(navigator.language);
  }
  try {
    const resolved = new Intl.DateTimeFormat().resolvedOptions().locale;
    if (resolved) candidates.push(resolved);
  } catch {
    // Intl unavailable; fall back to navigator candidates only.
  }

  for (const tag of candidates) {
    let region: string | undefined;
    try {
      region = new Intl.Locale(tag).region ?? undefined;
    } catch {
      region = tag.split('-')[1];
    }
    if (region && region.length === 2 && /^[A-Za-z]{2}$/.test(region)) {
      return region.toUpperCase();
    }
  }
  return null;
}

/**
 * Curated genre shortcuts shown as one-tap pills, mirroring Receiver's preset
 * strip. These map to the real radio-browser `tag` value (the pill text), not a
 * free-text name search.
 */
export const GENRE_PILLS = [
  'pop',
  'rock',
  'jazz',
  'classical',
  'electronic',
  'dance',
  'house',
  'hits',
  'oldies',
  'chillout',
  'news',
  'talk',
  'alternative',
  'indie',
  'metal',
  'hiphop',
  'latin',
  'soul',
  'blues',
  'folk',
  'country',
  'reggae',
  'lounge',
  'ambient',
] as const;
