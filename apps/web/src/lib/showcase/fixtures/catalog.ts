/**
 * The demo library. Every artist, album and track name here is invented for
 * showcase mode; none refers to a real release.
 */

import type { Track } from '@shiranami/contracts';
import { SHOWCASE_NOW } from '../determinism';
import { coverDataUrl, type CoverSpec } from './covers';

interface AlbumSeed {
  artist: string;
  album: string;
  year: number;
  genre: string;
  cover: Omit<CoverSpec, 'seed'>;
  /** Title and length in seconds, in track order. */
  tracks: Array<[string, number]>;
  /** Days before "now" the album was added to the library. */
  addedDaysAgo: number;
}

const ALBUMS: AlbumSeed[] = [
  {
    artist: 'Lantern Theory',
    album: 'Paper Moons',
    year: 2024,
    genre: 'Lo-fi',
    cover: { from: '#1e1b4b', to: '#6d28d9', accent: '#fde68a', motif: 'moon' },
    addedDaysAgo: 2,
    tracks: [
      ['Kettle at Midnight', 154],
      ['Paper Moons', 187],
      ['Window Seat Weather', 142],
      ['Sleepy Tram Line', 171],
      ['Moth Light', 133],
      ['Last Train Lullaby', 196],
    ],
  },
  {
    artist: 'Aoi Harbor',
    album: 'Tidewater Letters',
    year: 2022,
    genre: 'City Pop',
    cover: { from: '#0c4a6e', to: '#f472b6', accent: '#fef3c7', motif: 'waves' },
    addedDaysAgo: 40,
    tracks: [
      ['Harbor Lights at Four', 238],
      ['Tidewater Letters', 251],
      ['Pastel Freeway', 224],
      ['Seaside Payphone', 209],
      ['Blue Hour Radio', 262],
    ],
  },
  {
    artist: 'Glasshouse Choir',
    album: 'Frost on the Window',
    year: 2021,
    genre: 'Ambient',
    cover: { from: '#0f172a', to: '#38bdf8', accent: '#e0f2fe', motif: 'rings' },
    addedDaysAgo: 75,
    tracks: [
      ['First Frost', 312],
      ['Breath on Glass', 287],
      ['Cedar Hall', 344],
      ['Slow Snowfall', 401],
      ['A Room Kept Warm', 296],
    ],
  },
  {
    artist: 'Neon Orchard',
    album: 'Afterglow Transit',
    year: 2023,
    genre: 'Synthwave',
    cover: { from: '#2e1065', to: '#db2777', accent: '#22d3ee', motif: 'grid' },
    addedDaysAgo: 5,
    tracks: [
      ['Afterglow Transit', 246],
      ['Night Market Lights', 219],
      ['Chrome Rain', 233],
      ['Overpass', 201],
      ['Signal Fade', 258],
      ['Arcade at 2 AM', 227],
    ],
  },
  {
    artist: 'Umbra Lane',
    album: 'Night Bus Sketches',
    year: 2020,
    genre: 'Jazz',
    cover: { from: '#1c1917', to: '#b45309', accent: '#fcd34d', motif: 'stripes' },
    addedDaysAgo: 120,
    tracks: [
      ['Night Bus Sketches', 275],
      ['Brass in the Rain', 248],
      ['Corner Booth', 301],
      ['Streetlamp Waltz', 266],
      ['Closing Time Blues', 322],
    ],
  },
  {
    artist: 'Velvet Minutes',
    album: 'Rooftop Static',
    year: 2025,
    genre: 'Lo-fi',
    cover: { from: '#312e81', to: '#f97316', accent: '#fed7aa', motif: 'peaks' },
    addedDaysAgo: 1,
    tracks: [
      ['Rooftop Static', 148],
      ['Vinyl Crackle Sunday', 162],
      ['Laundromat Glow', 139],
      ['Warm Cassette', 157],
      ['Cloud Library', 171],
    ],
  },
  {
    artist: 'Hanabi Radio Club',
    album: 'Summer Relay',
    year: 2024,
    genre: 'J-Pop',
    cover: { from: '#be123c', to: '#facc15', accent: '#fff7ed', motif: 'orbit' },
    addedDaysAgo: 18,
    tracks: [
      ['Summer Relay', 214],
      ['Sparkler Promise', 198],
      ['Festival Steps', 206],
      ['Cicada Sky', 221],
      ['Goldfish Scoop', 187],
    ],
  },
  {
    artist: 'Coral Static',
    album: 'Undertow',
    year: 2022,
    genre: 'Dream Pop',
    cover: { from: '#134e4a', to: '#a78bfa', accent: '#ccfbf1', motif: 'waves' },
    addedDaysAgo: 60,
    tracks: [
      ['Undertow', 263],
      ['Glass Lagoon', 241],
      ['Soft Reverb Heart', 229],
      ['Swimming in Neon', 255],
    ],
  },
  {
    artist: 'Pine & Parallax',
    album: 'Cartographer',
    year: 2019,
    genre: 'Post-Rock',
    cover: { from: '#052e16', to: '#65a30d', accent: '#ecfccb', motif: 'peaks' },
    addedDaysAgo: 200,
    tracks: [
      ['Cartographer', 402],
      ['Contour Lines', 367],
      ['The Long Ridge', 425],
      ['Compass Rose', 338],
    ],
  },
  {
    artist: 'Soft Circuit',
    album: 'Kilobyte Lullabies',
    year: 2023,
    genre: 'Electronic',
    cover: { from: '#042f2e', to: '#0ea5e9', accent: '#a7f3d0', motif: 'grid' },
    addedDaysAgo: 30,
    tracks: [
      ['Boot Sequence', 176],
      ['Kilobyte Lullaby', 203],
      ['Pixel Garden', 188],
      ['Sleep Mode', 214],
      ['Tiny Satellites', 195],
    ],
  },
  {
    artist: 'Yuzu Avenue',
    album: 'Citrus Weekend',
    year: 2025,
    genre: 'City Pop',
    cover: { from: '#9a3412', to: '#fde047', accent: '#fffbeb', motif: 'moon' },
    addedDaysAgo: 9,
    tracks: [
      ['Citrus Weekend', 231],
      ['Convertible Daydream', 218],
      ['Sunset Boulevard Cafe', 244],
      ['Lemon Soda Love', 207],
      ['Coastline Mixtape', 236],
    ],
  },
  {
    artist: 'The Quiet Ferries',
    album: 'Salt and Static',
    year: 2021,
    genre: 'Indie',
    cover: { from: '#1e293b', to: '#64748b', accent: '#f1f5f9', motif: 'orbit' },
    addedDaysAgo: 150,
    tracks: [
      ['Salt and Static', 224],
      ['Ferry Terminal', 239],
      ['Gull Weather', 201],
      ['Postcards Unsent', 256],
    ],
  },
  {
    artist: 'Moth & Kettle',
    album: 'Slow Porch Hours',
    year: 2020,
    genre: 'Folk',
    cover: { from: '#422006', to: '#a16207', accent: '#fef9c3', motif: 'rings' },
    addedDaysAgo: 95,
    tracks: [
      ['Slow Porch Hours', 208],
      ['Kindling', 193],
      ['Wild Mint', 176],
      ['Lamplight Letter', 219],
    ],
  },
];

const KEYS = ['C major', 'A minor', 'G major', 'E minor', 'D major', 'F major', 'B minor'];
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ShowcaseAlbum {
  artist: string;
  album: string;
  year: number;
  genre: string;
  cover: string;
  trackIds: string[];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function build(): { tracks: Track[]; albums: ShowcaseAlbum[] } {
  const tracks: Track[] = [];
  const albums: ShowcaseAlbum[] = [];
  let n = 0;

  ALBUMS.forEach((seed, albumIndex) => {
    const cover = coverDataUrl({ ...seed.cover, seed: 101 + albumIndex * 37 });
    const addedAt = new Date(SHOWCASE_NOW - seed.addedDaysAgo * DAY_MS).toISOString();
    const trackIds: string[] = [];

    seed.tracks.forEach(([title, duration], trackIndex) => {
      n += 1;
      const id = `sc-${String(n).padStart(3, '0')}`;
      trackIds.push(id);
      tracks.push({
        id,
        filePath: `/Users/mika/Music/${seed.artist}/${seed.album}/${String(trackIndex + 1).padStart(2, '0')} ${title}.flac`,
        title,
        artist: seed.artist,
        albumArtist: seed.artist,
        album: seed.album,
        duration,
        genre: seed.genre,
        year: seed.year,
        trackNumber: trackIndex + 1,
        discNumber: 1,
        albumArt: cover,
        loudnessLufs: -14 + ((n * 7) % 60) / 10,
        isFavorite: n % 4 === 1 || n % 7 === 3,
        playCount: ((n * 13) % 29) + (albumIndex < 4 ? 12 : 2),
        createdAt: addedAt,
        updatedAt: addedAt,
        albumLoudnessLufs: -13.5 + (albumIndex % 5) / 2,
        truePeakDb: -1.2 + ((n * 3) % 10) / 10,
        loudnessRange: 5 + ((n * 5) % 70) / 10,
        bpm: 70 + ((n * 17) % 90),
        musicalKey: KEYS[n % KEYS.length] ?? null,
      });
    });

    albums.push({
      artist: seed.artist,
      album: seed.album,
      year: seed.year,
      genre: seed.genre,
      cover,
      trackIds,
    });
  });

  return { tracks, albums };
}

const built = build();

export const TRACKS: readonly Track[] = built.tracks;
export const ALBUM_LIST: readonly ShowcaseAlbum[] = built.albums;
export const TRACK_BY_ID = new Map(TRACKS.map(track => [track.id, track]));

/** Look a track up by id; the fixtures only ever ask for ids they created. */
export function trackById(id: string): Track {
  const track = TRACK_BY_ID.get(id);
  if (!track) throw new Error(`showcase fixture: unknown track ${id}`);
  return track;
}

/** Track ids by title, so hand-written fixtures read as names, not numbers. */
export function trackIdByTitle(title: string): string {
  const track = TRACKS.find(candidate => candidate.title === title);
  if (!track) throw new Error(`showcase fixture: unknown title ${title}`);
  return track.id;
}

export { slug };
