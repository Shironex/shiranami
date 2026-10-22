// The six camera stops of the listening room, in scroll order. This is the
// file to tune: camera poses, lens and the HTML copy for each stop.
//
// Room coordinates are metres. +X runs right along the window wall, +Y is up
// (floor at 0, desk top at 0.75) and +Z points out of the window wall into the
// room (the wall is at z = 0). Scene.tsx places every prop.
//
// No three.js imports here: the page and the island both read this file, and
// it must not pull three into the main bundle.

export type Vec3 = readonly [number, number, number];

export interface Copy {
  en: string;
  pl: string;
}

export interface RoomStop {
  id: 'hero' | 'library' | 'radio' | 'lyrics' | 'crossfade' | 'download';
  /** Short name for the stop, used in aria labels. */
  label: Copy;
  camera: {
    position: Vec3;
    target: Vec3;
    /** Vertical field of view in degrees (28 mm ≈ 46, 35 mm ≈ 38, 50 mm ≈ 27). */
    fov: number;
  };
  panel: {
    eyebrow: Copy;
    /** The heading reads `lead` then `accent` (in italics). */
    lead: Copy;
    accent: Copy;
    body: Copy;
  };
}

export const ROOM_STOPS: readonly RoomStop[] = [
  {
    id: 'hero',
    label: { en: 'The room', pl: 'Pokój' },
    camera: { position: [-0.66, 1.4, 4.6], target: [-0.66, 1.05, 0.3], fov: 46 },
    panel: {
      eyebrow: { en: 'Local-first desktop player', pl: 'Odtwarzacz na komputer, lokalnie' },
      lead: {
        en: 'A quieter place to listen, far from',
        pl: 'Spokojniejsze miejsce do słuchania, z dala od',
      },
      accent: { en: 'the algorithm.', pl: 'algorytmów.' },
      body: {
        en: 'Your own files, internet radio, synced lyrics and YouTube imports on one shelf. No streaming account, no rented music.',
        pl: 'Twoje pliki, radio internetowe, zsynchronizowane teksty i importy z YouTube na jednej półce. Bez konta w serwisie, bez wynajmowanej muzyki.',
      },
    },
  },
  {
    id: 'library',
    label: { en: 'Library', pl: 'Biblioteka' },
    camera: { position: [1.3, 1.78, 1.8], target: [1.82, 1.15, 0.3], fov: 38 },
    panel: {
      eyebrow: { en: 'Side A · Your library', pl: 'Strona A · Twoja biblioteka' },
      lead: { en: 'Your folders are the', pl: 'Twoje foldery to' },
      accent: { en: 'catalog.', pl: 'katalog.' },
      body: {
        en: 'Point Shiranami at a folder. It scans your files, reads the tags, lifts the cover art, and quietly hands you back a real library. No upload, no account, no maybe-it-syncs.',
        pl: 'Wskaż Shiranami folder. Przeskanuje pliki, odczyta tagi, wyciągnie okładki i po cichu odda Ci prawdziwą bibliotekę. Bez wysyłania, bez konta, bez „może się zsynchronizuje”.',
      },
    },
  },
  {
    id: 'radio',
    label: { en: 'Radio', pl: 'Radio' },
    camera: { position: [-0.36, 0.95, 1.7], target: [-0.3, 0.88, 0.43], fov: 24 },
    panel: {
      eyebrow: { en: 'Side B · Internet radio', pl: 'Strona B · Radio internetowe' },
      lead: { en: 'A radio dial, still', pl: 'Pokrętło radia, wciąż' },
      accent: { en: 'warm.', pl: 'ciepłe.' },
      body: {
        en: 'Browse, stream and favorite stations from Radio Browser. Soul out of Paris, lo-fi out of Tokyo, talk out of nowhere in particular.',
        pl: 'Przeglądaj, słuchaj i dodawaj do ulubionych stacje z Radio Browser. Soul z Paryża, lo-fi z Tokio, rozmowy znikąd w szczególności.',
      },
    },
  },
  {
    id: 'lyrics',
    label: { en: 'Lyrics', pl: 'Teksty' },
    camera: { position: [-0.15, 1.35, 2.3], target: [0.15, 1.35, 0.0], fov: 40 },
    panel: {
      eyebrow: { en: 'Side C · Synced lyrics', pl: 'Strona C · Zsynchronizowane teksty' },
      lead: { en: 'Lyrics that', pl: 'Teksty, które' },
      accent: { en: 'scroll with you.', pl: 'płyną z Tobą.' },
      body: {
        en: 'Time-synced lines glide past as the song plays. Click any line to seek there. The room dims; the words stay legible.',
        pl: 'Zsynchronizowane wersy przesuwają się razem z piosenką. Kliknij dowolny, aby tam przeskoczyć. Pokój przygasa, słowa zostają czytelne.',
      },
    },
  },
  {
    id: 'crossfade',
    label: { en: 'Crossfade', pl: 'Przenikanie' },
    camera: { position: [-0.2, 2.3, 1.9], target: [0.55, 0.75, 0.45], fov: 40 },
    panel: {
      eyebrow: { en: 'Side D · Crossfade', pl: 'Strona D · Przenikanie' },
      lead: { en: 'Tracks', pl: 'Utwory się' },
      accent: { en: 'melt, never bump.', pl: 'przenikają, nie zderzają.' },
      body: {
        en: 'Dual-deck engine with equal-power crossfade. Set it from one second to twelve and let songs hand the room over to each other.',
        pl: 'Dwa decki i przenikanie o stałej mocy. Ustaw od jednej do dwunastu sekund i pozwól piosenkom przekazywać sobie pokój.',
      },
    },
  },
  {
    id: 'download',
    label: { en: 'Download', pl: 'Pobierz' },
    camera: { position: [0.95, 1.5, 1.45], target: [0.3, 0.8, 0.42], fov: 34 },
    panel: {
      eyebrow: { en: 'Take it home', pl: 'Zabierz do domu' },
      lead: { en: 'Quiet, free, and', pl: 'Spokojnie, za darmo i' },
      accent: { en: 'yours.', pl: 'po Twojemu.' },
      body: {
        en: 'Free to download. Source-available. Updates land in-app on Windows; macOS users grab them from GitHub Releases.',
        pl: 'Darmowe pobranie. Kod dostępny. Aktualizacje trafiają do aplikacji na Windowsie; użytkownicy macOS pobierają je z GitHub Releases.',
      },
    },
  },
];
