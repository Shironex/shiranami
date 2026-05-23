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
