/**
 * The radio view talks to radio-browser through one shared client rather than
 * through `window.electronAPI`, so showcase mode answers on that client
 * instead: a fixed station list, and catalogs built from it. Nothing reaches
 * the network, and favicons are local `data:` URLs.
 */

import type { AdvancedStationQuery, CountryResult, Station } from 'radio-browser-api';
import { radioApi } from '@/components/radio/radioApi';
import { SHOWCASE_NOW } from '../determinism';
import { STATIONS, type ShowcaseStation } from './library';

function toStation(station: ShowcaseStation): Station {
  const at = new Date(SHOWCASE_NOW - 60 * 60 * 1000);
  return {
    changeId: station.id,
    id: station.id,
    name: station.name,
    url: station.url,
    urlResolved: station.urlResolved,
    homepage: station.homepage,
    favicon: station.favicon,
    tags: station.tags.split(','),
    country: station.country,
    countryCode: station.countryCode,
    state: '',
    language: [station.language],
    votes: station.votes,
    lastChangeTime: at,
    codec: station.codec,
    bitrate: station.bitrate,
    hls: false,
    lastCheckOk: true,
    lastCheckTime: at,
    lastCheckOkTime: at,
    lastLocalCheckTime: at,
    clickTimestamp: at,
    clickCount: station.clickCount,
    clickTrend: 3,
  };
}

function matchesQuery(station: ShowcaseStation, query: AdvancedStationQuery): boolean {
  const has = (value: string | undefined, field: string) =>
    !value || field.toLowerCase().includes(value.toLowerCase());
  const tags = query.tagList ?? (query.tag ? [query.tag] : []);
  return (
    has(query.name, station.name) &&
    has(query.countryCode, station.countryCode) &&
    has(query.language, station.language) &&
    tags.every(tag => station.tags.toLowerCase().includes(tag.toLowerCase()))
  );
}

function countBy(values: string[]): CountryResult[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, stationcount: count * 120 }));
}

/** Point the shared radio-browser client at the fixture stations. */
export function installShowcaseRadio(): void {
  radioApi.searchStations = async query =>
    (query.offset ?? 0) > 0
      ? []
      : STATIONS.filter(station => matchesQuery(station, query)).map(toStation);
  radioApi.getCountryCodes = async () => countBy(STATIONS.map(station => station.countryCode));
  radioApi.getLanguages = async () => countBy(STATIONS.map(station => station.language));
  radioApi.getTags = async () => countBy(STATIONS.flatMap(station => station.tags.split(',')));
}
