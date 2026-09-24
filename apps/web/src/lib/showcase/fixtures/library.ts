/**
 * Everything built on top of the catalog: playlists, smart playlists, listening
 * history, recommendations, downloads, search results and radio stations. All
 * of it is derived from fixed seeds and {@link SHOWCASE_NOW}.
 */

import type {
  DownloadQueueSnapshot,
  ListeningActivityPoint,
  ListeningHistoryEntry,
  ListeningHourlyActivityPoint,
  ListeningStatsSummary,
  Playlist,
  RadioFavorite,
  RecommendationShelves,
  SearchResult,
  SmartMixResult,
  SmartPlaylist,
  SmartPlaylistDefinition,
  SmartPlaylistRule,
  Track,
  WeeklyInsights,
} from '@shiranami/contracts';
import { SHOWCASE_NOW, seededRandom } from '../determinism';
import { ALBUM_LIST, TRACKS, trackById, trackIdByTitle } from './catalog';
import { coverDataUrl, stationLogoDataUrl } from './covers';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const iso = (msBeforeNow: number) => new Date(SHOWCASE_NOW - msBeforeNow).toISOString();

// ── Playlists ─────────────────────────────────────────────────────────────

interface PlaylistSeed {
  id: string;
  name: string;
  description: string;
  cover: Parameters<typeof coverDataUrl>[0] | null;
  titles: string[];
  createdDaysAgo: number;
}

const PLAYLIST_SEEDS: PlaylistSeed[] = [
  {
    id: 'pl-late-night',
    name: 'Late Night Study',
    description: 'Soft beats for the last chapter before bed.',
    cover: { from: '#1e1b4b', to: '#4c1d95', accent: '#c4b5fd', motif: 'moon', seed: 11 },
    titles: [
      'Kettle at Midnight',
      'Rooftop Static',
      'Window Seat Weather',
      'Cloud Library',
      'Sleepy Tram Line',
      'Warm Cassette',
      'Kilobyte Lullaby',
      'Laundromat Glow',
      'Moth Light',
      'Sleep Mode',
    ],
    createdDaysAgo: 34,
  },
  {
    id: 'pl-city-lights',
    name: 'City Lights Drive',
    description: 'Windows down, neon up.',
    cover: { from: '#831843', to: '#1d4ed8', accent: '#fbcfe8', motif: 'grid', seed: 12 },
    titles: [
      'Afterglow Transit',
      'Pastel Freeway',
      'Night Market Lights',
      'Convertible Daydream',
      'Chrome Rain',
      'Harbor Lights at Four',
      'Coastline Mixtape',
      'Overpass',
    ],
    createdDaysAgo: 21,
  },
  {
    id: 'pl-rainy-sunday',
    name: 'Rainy Sunday',
    description: 'Tea, a blanket and the sound of the gutter.',
    cover: { from: '#0f172a', to: '#475569', accent: '#bae6fd', motif: 'waves', seed: 13 },
    titles: [
      'Breath on Glass',
      'Brass in the Rain',
      'Slow Porch Hours',
      'Glass Lagoon',
      'Gull Weather',
      'A Room Kept Warm',
      'Lamplight Letter',
    ],
    createdDaysAgo: 60,
  },
  {
    id: 'pl-deep-focus',
    name: 'Deep Focus',
    description: 'Long instrumentals, no words.',
    cover: { from: '#022c22', to: '#0f766e', accent: '#99f6e4', motif: 'rings', seed: 14 },
    titles: [
      'Cartographer',
      'Cedar Hall',
      'Contour Lines',
      'Slow Snowfall',
      'The Long Ridge',
      'Pixel Garden',
      'First Frost',
    ],
    createdDaysAgo: 90,
  },
  {
    id: 'pl-summer',
    name: 'Summer Festival',
    description: 'Fireworks, yukata and too much shaved ice.',
    cover: { from: '#be123c', to: '#f59e0b', accent: '#fef3c7', motif: 'orbit', seed: 15 },
    titles: [
      'Summer Relay',
      'Sparkler Promise',
      'Citrus Weekend',
      'Festival Steps',
      'Lemon Soda Love',
      'Goldfish Scoop',
      'Cicada Sky',
    ],
    createdDaysAgo: 12,
  },
  {
    id: 'pl-jazz-corner',
    name: 'Corner Booth Jazz',
    description: 'A small club, a smaller stage.',
    cover: { from: '#292524', to: '#92400e', accent: '#fde68a', motif: 'stripes', seed: 16 },
    titles: [
      'Night Bus Sketches',
      'Corner Booth',
      'Streetlamp Waltz',
      'Closing Time Blues',
      'Brass in the Rain',
    ],
    createdDaysAgo: 120,
  },
];

export const PLAYLISTS: Playlist[] = PLAYLIST_SEEDS.map(seed => ({
  id: seed.id,
  name: seed.name,
  description: seed.description,
  coverArt: seed.cover ? coverDataUrl(seed.cover) : undefined,
  createdAt: iso(seed.createdDaysAgo * DAY_MS),
  updatedAt: iso(Math.max(1, seed.createdDaysAgo - 5) * DAY_MS),
}));

export const PLAYLIST_TRACKS = new Map<string, string[]>(
  PLAYLIST_SEEDS.map(seed => [seed.id, seed.titles.map(trackIdByTitle)])
);

// ── Smart playlists ───────────────────────────────────────────────────────

export const SMART_PLAYLISTS: SmartPlaylist[] = [
  {
    id: 'sp-slow-evenings',
    name: 'Slow Evenings',
    description: 'Everything under 95 BPM.',
    matchType: 'all',
    rules: [{ field: 'bpm', operator: 'lessThan', value: '95' }],
    createdAt: iso(45 * DAY_MS),
    updatedAt: iso(10 * DAY_MS),
  },
  {
    id: 'sp-heavy-rotation',
    name: 'Heavy Rotation',
    description: 'Favorites played more than 15 times.',
    matchType: 'all',
    rules: [
      { field: 'isFavorite', operator: 'is', value: 'true' },
      { field: 'playCount', operator: 'greaterThan', value: '15' },
    ],
    createdAt: iso(30 * DAY_MS),
    updatedAt: iso(3 * DAY_MS),
  },
  {
    id: 'sp-city-pop',
    name: 'City Pop and Synthwave',
    description: 'Neon genres, any year.',
    matchType: 'any',
    rules: [
      { field: 'genre', operator: 'is', value: 'City Pop' },
      { field: 'genre', operator: 'is', value: 'Synthwave' },
    ],
    createdAt: iso(20 * DAY_MS),
    updatedAt: iso(20 * DAY_MS),
  },
  {
    id: 'sp-fresh',
    name: 'Fresh This Month',
    description: 'Added in the last 30 days.',
    matchType: 'all',
    rules: [{ field: 'dateAdded', operator: 'inLastDays', value: '30' }],
    createdAt: iso(60 * DAY_MS),
    updatedAt: iso(60 * DAY_MS),
  },
];

function fieldValue(track: Track, field: SmartPlaylistRule['field']): string | number | null {
  switch (field) {
    case 'genre':
    case 'artist':
    case 'album':
    case 'title':
    case 'musicalKey':
      return track[field];
    case 'year':
    case 'playCount':
    case 'bpm':
    case 'duration':
    case 'loudnessLufs':
      return track[field];
    case 'isFavorite':
      return track.isFavorite ? 'true' : 'false';
    case 'dateAdded':
      return Date.parse(track.createdAt);
    case 'lastPlayed':
      return null;
  }
}

function matches(track: Track, rule: SmartPlaylistRule): boolean {
  const actual = fieldValue(track, rule.field);
  if (actual === null) return false;
  const text = String(actual).toLowerCase();
  const wanted = rule.value.toLowerCase();
  switch (rule.operator) {
    case 'is':
      return text === wanted;
    case 'isNot':
      return text !== wanted;
    case 'contains':
      return text.includes(wanted);
    case 'greaterThan':
      return Number(actual) > Number(rule.value);
    case 'lessThan':
      return Number(actual) < Number(rule.value);
    case 'between':
      return Number(actual) >= Number(rule.value) && Number(actual) <= Number(rule.valueTo);
    case 'inLastDays':
      return Number(actual) >= SHOWCASE_NOW - Number(rule.value) * DAY_MS;
    case 'notInLastDays':
      return Number(actual) < SHOWCASE_NOW - Number(rule.value) * DAY_MS;
  }
}

export function evaluateSmartPlaylist(definition: SmartPlaylistDefinition): Track[] {
  const { rules, matchType, limit } = definition;
  const hits = TRACKS.filter(track =>
    rules.length === 0
      ? true
      : matchType === 'all'
        ? rules.every(rule => matches(track, rule))
        : rules.some(rule => matches(track, rule))
  );
  return limit ? hits.slice(0, limit) : hits;
}

// ── Listening history ─────────────────────────────────────────────────────

/** Recent plays: a believable evening, then the days before it. */
function buildHistory(): ListeningHistoryEntry[] {
  const random = seededRandom(4242);
  const entries: ListeningHistoryEntry[] = [];
  let at = SHOWCASE_NOW - 6 * MINUTE_MS;
  for (let i = 0; i < 60; i += 1) {
    const track = TRACKS[Math.floor(random() * TRACKS.length)] ?? TRACKS[0];
    if (!track) break;
    const duration = track.duration ?? 200;
    const completed = random() > 0.18;
    const playedSeconds = completed ? duration : Math.round(duration * (0.2 + random() * 0.5));
    entries.push({
      id: `h-${String(i + 1).padStart(3, '0')}`,
      trackId: track.id,
      title: track.title,
      artist: track.artist ?? '',
      album: track.album ?? '',
      albumArt: track.albumArt,
      duration: track.duration,
      playedAt: new Date(at).toISOString(),
      playedSeconds,
      completionRatio: playedSeconds / duration,
      completed,
      source: 'library',
    });
    // Songs back to back within a sitting; every sixth play ends the sitting with a 5 to 19 hour break,
    // which spreads the history over a week of separate sittings.
    at -= duration * 1000 + (i % 6 === 5 ? (5 + random() * 14) * HOUR_MS : 20 * 1000);
  }
  return entries;
}

export const HISTORY = buildHistory();

function topTracks(limit: number) {
  return [...TRACKS]
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((track, index) => ({
      trackId: track.id,
      title: track.title,
      artist: track.artist ?? '',
      album: track.album ?? '',
      albumArt: track.albumArt,
      playCount: track.playCount ?? 0,
      listenedSeconds: (track.playCount ?? 0) * (track.duration ?? 200),
      lastPlayedAt: iso((index + 1) * 5 * 60 * MINUTE_MS),
    }));
}

function topArtists(limit: number) {
  const totals = new Map<string, { plays: number; seconds: number }>();
  for (const track of TRACKS) {
    const artist = track.artist ?? '';
    const entry = totals.get(artist) ?? { plays: 0, seconds: 0 };
    entry.plays += track.playCount ?? 0;
    entry.seconds += (track.playCount ?? 0) * (track.duration ?? 200);
    totals.set(artist, entry);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1].plays - a[1].plays || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([artist, entry]) => ({
      artist,
      playCount: entry.plays,
      listenedSeconds: entry.seconds,
    }));
}

/** Scale the all-time numbers down for shorter windows, so 7 days reads smaller than 30. */
export function listeningSummary(since?: string | null): ListeningStatsSummary {
  const days = since ? Math.max(1, (SHOWCASE_NOW - Date.parse(since)) / DAY_MS) : 365;
  const scale = Math.min(1, days / 30);
  const plays = Math.round(1240 * scale) || 1;
  return {
    totalPlays: plays,
    totalMinutes: Math.round(plays * 3.6),
    uniqueTracks: Math.min(TRACKS.length, Math.round(18 + 40 * scale)),
    uniqueArtists: Math.min(ALBUM_LIST.length, Math.round(7 + 6 * scale)),
    completedPlays: Math.round(plays * 0.84),
    topTracks: topTracks(10),
    topArtists: topArtists(8),
  };
}

/**
 * One point per day from `since` to `until`, keyed the way the history view
 * keys them (the ISO date of each local midnight).
 */
export function listeningActivity(
  since?: string | null,
  until?: string | null
): ListeningActivityPoint[] {
  const end = until ? Date.parse(until) : SHOWCASE_NOW;
  const start = since ? Date.parse(since) : end - 29 * DAY_MS;
  const points: ListeningActivityPoint[] = [];
  for (let at = start; at < end; at += DAY_MS) {
    const day = Math.floor(at / DAY_MS);
    const random = seededRandom(day);
    const weekend = [0, 6].includes(new Date(at).getDay());
    const plays = Math.round(8 + random() * 22 + (weekend ? 10 : 0));
    points.push({
      date: new Date(at).toISOString().slice(0, 10),
      playCount: plays,
      listenedMinutes: Math.round(plays * (3 + random())),
    });
  }
  return points;
}

/** The hour-by-weekday grid: quiet mornings, a lunch bump, busy evenings. */
export function hourlyActivity(): ListeningHourlyActivityPoint[] {
  const random = seededRandom(77);
  const points: ListeningHourlyActivityPoint[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const evening = Math.exp(-((hour - 21.5) ** 2) / 8) * 14;
      const lunch = Math.exp(-((hour - 13) ** 2) / 3) * 5;
      const night = hour < 2 ? 6 : 0;
      const plays = Math.round(evening + lunch + night + random() * 3);
      points.push({ dayOfWeek, hour, playCount: plays, listenedMinutes: plays * 4 });
    }
  }
  return points;
}

export function weeklyInsights(): WeeklyInsights {
  return {
    sessionCount: 23,
    topAlbums: ALBUM_LIST.slice(0, 5).map((album, index) => ({
      album: album.album,
      artist: album.artist,
      albumArt: album.cover,
      playCount: 42 - index * 7,
    })),
  };
}

// ── Recommendations and mixes ─────────────────────────────────────────────

const DISCOVER: Array<[string, string]> = [
  ['Lanterns Over the Canal (live session)', 'Lantern Theory'],
  ['Midnight Ferry Demo', 'The Quiet Ferries'],
  ['Neon Orchard: Transit Tapes', 'Neon Orchard'],
  ['Moonlit Kettle Loop, 1 hour', 'Velvet Minutes'],
  ['Harbor Lights (acoustic)', 'Aoi Harbor'],
  ['Snowglobe Suite', 'Glasshouse Choir'],
];

export const DISCOVER_RESULTS: SearchResult[] = DISCOVER.map(([title, uploader], index) => ({
  id: `yt-disc-${index + 1}`,
  title,
  uploader,
  duration: 180 + index * 41,
  thumbnail: coverDataUrl({
    from: ['#312e81', '#0c4a6e', '#831843', '#422006', '#134e4a', '#1e293b'][index] ?? '#312e81',
    to: ['#db2777', '#22d3ee', '#f59e0b', '#fb923c', '#a78bfa', '#94a3b8'][index] ?? '#db2777',
    accent: '#fff7ed',
    motif: (['waves', 'orbit', 'grid', 'moon', 'rings', 'peaks'] as const)[index] ?? 'waves',
    seed: 300 + index,
  }),
  url: `https://www.youtube.com/watch?v=showcase${index + 1}`,
  webpage_url: `https://www.youtube.com/watch?v=showcase${index + 1}`,
  view_count: 12000 + index * 48213,
}));

export function recommendationShelves(): RecommendationShelves {
  const picks = [
    'Glass Lagoon',
    'Corner Booth',
    'Pixel Garden',
    'Ferry Terminal',
    'Kindling',
    'Chrome Rain',
  ];
  return {
    library: {
      kind: 'library',
      items: picks.map(title => {
        const track = trackById(trackIdByTitle(title));
        return {
          trackId: track.id,
          title: track.title,
          artist: track.artist ?? '',
          album: track.album ?? '',
          albumArt: track.albumArt,
        };
      }),
      generatedAt: iso(2 * 60 * MINUTE_MS),
      stale: false,
    },
    discover: {
      kind: 'discover',
      items: DISCOVER_RESULTS.map(result => ({
        youtubeId: result.id,
        title: result.title,
        uploader: result.uploader,
        thumbnail: result.thumbnail,
        url: result.url,
      })),
      generatedAt: iso(2 * 60 * MINUTE_MS),
      stale: false,
    },
  };
}

const byGenre = (...genres: string[]) =>
  TRACKS.filter(track => genres.includes(track.genre ?? '')).map(track => track.id);

export function smartMixes(): SmartMixResult[] {
  return [
    {
      id: 'mix-late-night',
      kind: 'late-night',
      titleKey: 'smart.lateNight',
      descKey: 'smart.lateNightDesc',
      trackIds: byGenre('Lo-fi', 'Ambient', 'Jazz'),
    },
    {
      id: 'mix-focus',
      kind: 'focus',
      titleKey: 'smart.focus',
      descKey: 'smart.focusDesc',
      trackIds: byGenre('Post-Rock', 'Ambient', 'Electronic'),
    },
    {
      id: 'mix-rainy',
      kind: 'rainy-day',
      titleKey: 'smart.rainyDay',
      descKey: 'smart.rainyDayDesc',
      trackIds: byGenre('Dream Pop', 'Folk', 'Indie'),
    },
    {
      id: 'mix-decade-2020',
      kind: 'decade',
      titleKey: 'smart.decade',
      descKey: 'smart.decadeDesc',
      decade: 2020,
      trackIds: TRACKS.filter(track => (track.year ?? 0) >= 2020).map(track => track.id),
    },
  ];
}

// ── Downloads ─────────────────────────────────────────────────────────────

export function downloadQueue(): DownloadQueueSnapshot {
  const at = (minutesAgo: number) => SHOWCASE_NOW - minutesAgo * MINUTE_MS;
  const items: DownloadQueueSnapshot['items'] = [
    {
      id: 'dl-1',
      url: DISCOVER_RESULTS[0]?.url ?? '',
      youtubeId: 'showcase1',
      title: DISCOVER_RESULTS[0]?.title ?? '',
      thumbnail: DISCOVER_RESULTS[0]?.thumbnail,
      status: 'active',
      progress: 64,
      enqueuedAt: at(3),
      startedAt: at(2),
    },
    {
      id: 'dl-2',
      url: DISCOVER_RESULTS[1]?.url ?? '',
      youtubeId: 'showcase2',
      title: DISCOVER_RESULTS[1]?.title ?? '',
      thumbnail: DISCOVER_RESULTS[1]?.thumbnail,
      status: 'converting',
      progress: 100,
      enqueuedAt: at(3),
      startedAt: at(2),
    },
    {
      id: 'dl-3',
      url: DISCOVER_RESULTS[2]?.url ?? '',
      youtubeId: 'showcase3',
      title: DISCOVER_RESULTS[2]?.title ?? '',
      thumbnail: DISCOVER_RESULTS[2]?.thumbnail,
      status: 'queued',
      progress: 0,
      enqueuedAt: at(2),
    },
    {
      id: 'dl-4',
      url: DISCOVER_RESULTS[3]?.url ?? '',
      youtubeId: 'showcase4',
      title: DISCOVER_RESULTS[3]?.title ?? '',
      thumbnail: DISCOVER_RESULTS[3]?.thumbnail,
      status: 'queued',
      progress: 0,
      enqueuedAt: at(2),
    },
    {
      id: 'dl-6',
      url: DISCOVER_RESULTS[5]?.url ?? '',
      youtubeId: 'showcase6',
      title: DISCOVER_RESULTS[5]?.title ?? '',
      thumbnail: DISCOVER_RESULTS[5]?.thumbnail,
      status: 'error',
      progress: 12,
      error: 'This video is unavailable in your region.',
      enqueuedAt: at(20),
      startedAt: at(19),
      finishedAt: at(18),
    },
  ];
  return { items, maxConcurrency: 2, activeCount: 2, paused: false };
}

// ── Search ────────────────────────────────────────────────────────────────

const SEARCH_TITLES = [
  'Paper Moons (full album)',
  'Paper Moons, lofi remix',
  'Kettle at Midnight (live at the tram depot)',
  'Paper Moons, piano cover',
  'Last Train Lullaby, extended',
  'Lantern Theory: rooftop session',
  'Paper Moons, slowed and reverb',
  'Window Seat Weather (acoustic)',
];

export function searchResults(query: string): SearchResult[] {
  const random = seededRandom(query.length * 131 + 7);
  return SEARCH_TITLES.map((title, index) => ({
    id: `yt-search-${index + 1}`,
    title,
    uploader: index % 3 === 1 ? 'Midnight Tape Club' : 'Lantern Theory',
    duration: Math.round(150 + random() * 240),
    thumbnail: coverDataUrl({
      from: '#1e1b4b',
      to: ['#6d28d9', '#be185d', '#0369a1', '#b45309'][index % 4] ?? '#6d28d9',
      accent: '#fde68a',
      motif: (['moon', 'waves', 'rings', 'stripes'] as const)[index % 4] ?? 'moon',
      seed: 500 + index,
    }),
    url: `https://www.youtube.com/watch?v=search${index + 1}`,
    webpage_url: `https://www.youtube.com/watch?v=search${index + 1}`,
    view_count: Math.round(3000 + random() * 900000),
  }));
}

export function searchSuggestions(query: string): string[] {
  const base = query.trim() || 'paper moons';
  return [base, `${base} lofi`, `${base} full album`, `${base} live`, `${base} piano`];
}

/** An imported playlist, as the extractor would resolve it. */
export function extractedPlaylist(): { title: string | null; tracks: SearchResult[] } {
  const titles: Array<[string, string, number]> = [
    ['Lantern Theory', 'Kettle at Midnight', 0.97],
    ['Aoi Harbor', 'Pastel Freeway', 0.94],
    ['Neon Orchard', 'Chrome Rain', 0.91],
    ['Velvet Minutes', 'Warm Cassette', 0.88],
    ['Yuzu Avenue', 'Lemon Soda Love', 0.93],
    ['Coral Static', 'Glass Lagoon', 0.62],
    ['Umbra Lane', 'Corner Booth', 0.9],
    ['Soft Circuit', 'Tiny Satellites', 0.86],
    ['Hanabi Radio Club', 'Cicada Sky', 0.95],
    ['Moth & Kettle', 'Wild Mint', 0.58],
  ];
  return {
    title: 'Evening Commute',
    tracks: titles.map(([artist, title, confidence], index) => ({
      id: `yt-import-${index + 1}`,
      title: `${artist} - ${title}`,
      uploader: artist,
      duration: 180 + ((index * 37) % 120),
      thumbnail: coverDataUrl({
        from: '#0f172a',
        to: ['#7c3aed', '#0891b2', '#db2777', '#ca8a04', '#16a34a'][index % 5] ?? '#7c3aed',
        accent: '#f8fafc',
        motif: (['orbit', 'grid', 'peaks', 'waves', 'rings'] as const)[index % 5] ?? 'orbit',
        seed: 700 + index,
      }),
      url: `https://www.youtube.com/watch?v=import${index + 1}`,
      webpage_url: `https://www.youtube.com/watch?v=import${index + 1}`,
      view_count: 20000 + index * 7331,
      matchConfidence: confidence,
      matchFlag: confidence < 0.7 ? 'low' : 'ok',
    })),
  };
}

// ── Radio ─────────────────────────────────────────────────────────────────

interface StationSeed {
  name: string;
  country: string;
  countryCode: string;
  language: string;
  tags: string;
  codec: string;
  bitrate: number;
  colors: [string, string];
}

const STATION_SEEDS: StationSeed[] = [
  {
    name: 'Moonlight Lofi FM',
    country: 'Japan',
    countryCode: 'JP',
    language: 'japanese',
    tags: 'lofi,chill,beats',
    codec: 'MP3',
    bitrate: 192,
    colors: ['#4c1d95', '#db2777'],
  },
  {
    name: 'Harbor Jazz Radio',
    country: 'Poland',
    countryCode: 'PL',
    language: 'polish',
    tags: 'jazz,smooth jazz',
    codec: 'AAC',
    bitrate: 128,
    colors: ['#78350f', '#f59e0b'],
  },
  {
    name: 'Neon Wave 24',
    country: 'Germany',
    countryCode: 'DE',
    language: 'english',
    tags: 'synthwave,retrowave',
    codec: 'MP3',
    bitrate: 256,
    colors: ['#831843', '#22d3ee'],
  },
  {
    name: 'Quiet Pines Ambient',
    country: 'Canada',
    countryCode: 'CA',
    language: 'english',
    tags: 'ambient,sleep',
    codec: 'OGG',
    bitrate: 160,
    colors: ['#052e16', '#65a30d'],
  },
  {
    name: 'City Pop Station',
    country: 'Japan',
    countryCode: 'JP',
    language: 'japanese',
    tags: 'city pop,80s',
    codec: 'MP3',
    bitrate: 192,
    colors: ['#be123c', '#facc15'],
  },
  {
    name: 'Rainy Window Radio',
    country: 'United Kingdom',
    countryCode: 'GB',
    language: 'english',
    tags: 'lofi,rain,study',
    codec: 'AAC',
    bitrate: 96,
    colors: ['#0f172a', '#38bdf8'],
  },
  {
    name: 'Radio Kawiarnia',
    country: 'Poland',
    countryCode: 'PL',
    language: 'polish',
    tags: 'acoustic,folk,cafe',
    codec: 'MP3',
    bitrate: 128,
    colors: ['#422006', '#d97706'],
  },
  {
    name: 'Starfield Electronica',
    country: 'Netherlands',
    countryCode: 'NL',
    language: 'english',
    tags: 'electronic,downtempo',
    codec: 'AAC',
    bitrate: 192,
    colors: ['#042f2e', '#0ea5e9'],
  },
  {
    name: 'Late Tram Beats',
    country: 'Czechia',
    countryCode: 'CZ',
    language: 'czech',
    tags: 'hip hop,instrumental',
    codec: 'MP3',
    bitrate: 128,
    colors: ['#1e1b4b', '#6366f1'],
  },
  {
    name: 'Coastal Dream Pop',
    country: 'Portugal',
    countryCode: 'PT',
    language: 'portuguese',
    tags: 'dream pop,indie',
    codec: 'OGG',
    bitrate: 160,
    colors: ['#134e4a', '#a78bfa'],
  },
  {
    name: 'Festival Night FM',
    country: 'Japan',
    countryCode: 'JP',
    language: 'japanese',
    tags: 'j-pop,anime',
    codec: 'MP3',
    bitrate: 320,
    colors: ['#9f1239', '#fb923c'],
  },
  {
    name: 'Northern Post-Rock',
    country: 'Iceland',
    countryCode: 'IS',
    language: 'icelandic',
    tags: 'post-rock,instrumental',
    codec: 'MP3',
    bitrate: 192,
    colors: ['#1e293b', '#94a3b8'],
  },
];

export interface ShowcaseStation {
  id: string;
  name: string;
  url: string;
  urlResolved: string;
  homepage: string;
  favicon: string;
  country: string;
  countryCode: string;
  language: string;
  codec: string;
  bitrate: number;
  tags: string;
  votes: number;
  clickCount: number;
}

export const STATIONS: ShowcaseStation[] = STATION_SEEDS.map((seed, index) => {
  const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
  return {
    id,
    name: seed.name,
    // A reserved example host: nothing ever resolves or plays in showcase mode.
    url: `https://radio.example.invalid/${id}`,
    urlResolved: `https://radio.example.invalid/${id}`,
    homepage: '',
    favicon: stationLogoDataUrl(seed.name, seed.colors[0], seed.colors[1]),
    country: seed.country,
    countryCode: seed.countryCode,
    language: seed.language,
    codec: seed.codec,
    bitrate: seed.bitrate,
    tags: seed.tags,
    votes: 4800 - index * 311,
    clickCount: 920 - index * 57,
  };
});

export const RADIO_FAVORITES: RadioFavorite[] = STATIONS.slice(0, 4).map((station, index) => ({
  id: `rf-${index + 1}`,
  stationUuid: station.id,
  name: station.name,
  url: station.url,
  urlResolved: station.urlResolved,
  homepage: null,
  favicon: station.favicon,
  country: station.country,
  countryCode: station.countryCode,
  language: station.language,
  codec: station.codec,
  bitrate: station.bitrate,
  tags: station.tags,
  createdAt: iso((index + 3) * DAY_MS),
}));

// ── Now playing ───────────────────────────────────────────────────────────

/** The track on the player bar, a third of the way in. */
export const NOW_PLAYING_ID = trackIdByTitle('Paper Moons');

export const NOW_PLAYING_LYRICS: Array<[number, string]> = [
  [0, 'Paper moons on a string above the sink'],
  [9.5, 'The kettle hums the only song it knows'],
  [18.2, 'I fold the evening small enough to keep'],
  [27.8, 'And tuck it in the pocket of my coat'],
  [37.4, 'Oh, paper moons, you never learned to set'],
  [46.1, 'You just hang there where I pinned you last'],
  [55.6, 'The tram goes by, the windows hold its light'],
  [64.9, 'A little longer than the tram itself'],
  [74.2, 'Paper moons, paper moons'],
  [82.8, 'Glowing on the ceiling of my room'],
  [92.3, 'Paper moons, paper moons'],
  [101.0, 'Keep the dark from getting in too soon'],
  [112.4, 'The radio forgets another name'],
  [121.9, 'The rain writes cursive on the glass'],
  [131.5, 'I leave the lamp on for the ones who wander'],
  [141.0, 'And the paper moons for when they pass'],
];
