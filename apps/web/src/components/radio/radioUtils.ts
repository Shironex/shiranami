import type { Track } from '@/stores/types';
import type { Station } from 'radio-browser-api';

export const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'GB', name: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'PL', name: 'Poland', flag: '\u{1F1F5}\u{1F1F1}' },
  { code: 'JP', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'DE', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'FR', name: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'ES', name: 'Spain', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'BR', name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'KR', name: 'South Korea', flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'AU', name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
  { code: 'CA', name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' },
  { code: 'IT', name: 'Italy', flag: '\u{1F1EE}\u{1F1F9}' },
  { code: 'NL', name: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}' },
  { code: 'RU', name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
  { code: 'IN', name: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
];

export function stationToTrack(station: Station, liveRadioLabel: string): Track {
  const streamUrl = station.urlResolved || station.url;
  const tagsStr = Array.isArray(station.tags) ? station.tags.join(', ') : '';
  return {
    id: `radio:${station.id}`,
    title: station.name,
    artist: liveRadioLabel,
    album: [station.country, station.codec, station.bitrate ? `${station.bitrate}kbps` : '']
      .filter(Boolean)
      .join(' \u00B7 '),
    duration: 0,
    filePath: `shiranami-radio://stream?url=${encodeURIComponent(streamUrl)}`,
    albumArt: station.favicon || undefined,
    genre: tagsStr.split(',')[0]?.trim() || null,
  };
}

export function getCountryFlag(countryCode: string): string {
  const country = COUNTRIES.find((c) => c.code === countryCode);
  return country?.flag ?? '';
}
