export type ChangelogLanguage = 'en' | 'pl';

export interface LocalizedText {
  en: string;
  pl: string;
}

export interface ChangelogCategory {
  label: LocalizedText;
  entries: LocalizedText[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: LocalizedText;
  description: LocalizedText;
  categories: ChangelogCategory[];
}

export interface ResolvedChangelogCategory {
  label: string;
  entries: string[];
}

export interface ResolvedChangelogRelease {
  version: string;
  date: string;
  title: string;
  description: string;
  categories: ResolvedChangelogCategory[];
}

const l = (en: string, pl: string): LocalizedText => ({ en, pl });

function localeFor(lang: ChangelogLanguage): string {
  return lang === 'pl' ? 'pl-PL' : 'en-US';
}

export function formatChangelogDate(date: string, lang: ChangelogLanguage): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function getLocalizedChangelog(lang: ChangelogLanguage): ResolvedChangelogRelease[] {
  return changelog.map(release => ({
    version: release.version,
    date: formatChangelogDate(release.date, lang),
    title: release.title[lang],
    description: release.description[lang],
    categories: release.categories.map(category => ({
      label: category.label[lang],
      entries: category.entries.map(entry => entry[lang]),
    })),
  }));
}

export function getLocalizedChangelogTitle(
  version: string,
  lang: ChangelogLanguage
): string | null {
  const normalizedVersion = version.replace(/^v/i, '');
  const release = changelog.find(entry => entry.version === normalizedVersion);
  return release ? release.title[lang] : null;
}

// kanji assigned per release to give the changelog masthead a visual anchor
const KANJI_BY_VERSION: Record<string, string> = {
  '0.16.0': '等', // "equal" — equalizer release
  '0.15.0': '白', // "white" — the named release
  '0.14.1': '速', // "fast"
  '0.14.0': '光', // "light" / ambient color
  '0.13.1': '波', // "wave"
  '0.13.0': '波', // "wave" — crossfade
  '0.12.3': '詞', // "lyrics"
  '0.12.2': '詞',
  '0.12.1': '詞',
  '0.12.0': '詞',
  '0.11.0': '輸', // "import"
  '0.10.0': '電', // "radio"
  '0.9.0': '密', // "compact"
  '0.8.0': '索', // "search"
  '0.7.1': '愛',
  '0.7.0': '愛', // "favorite / love"
  '0.6.1': '視',
  '0.6.0': '視', // "visual"
  '0.5.1': '始',
  '0.5.0': '始', // "beginning"
  '0.4.0': '音', // "sound"
  '0.3.1': '調',
  '0.3.0': '調', // "tune"
  '0.2.1': '静',
  '0.2.0': '静', // "quiet"
  '0.1.0': '初', // "first"
};

export function kanjiForVersion(version: string): string {
  return KANJI_BY_VERSION[version] ?? '白';
}

export type ReleaseKind = 'feature' | 'fix' | 'perf' | 'polish';

export function kindOfRelease(release: ResolvedChangelogRelease): ReleaseKind {
  const labels = release.categories.map(c => c.label.toLowerCase()).join(' ');
  if (labels.includes('new') || labels.includes('nowe')) return 'feature';
  if (
    labels.includes('fix') ||
    labels.includes('bug') ||
    labels.includes('błę') ||
    labels.includes('popraw')
  )
    return 'fix';
  if (labels.includes('perf') || labels.includes('wydaj')) return 'perf';
  return 'polish';
}

export function weekdayLabel(date: string, lang: ChangelogLanguage): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export const changelog: ChangelogRelease[] = [
  {
    version: '0.16.0',
    date: '2026-04-26',
    title: l(
      'Equalizer with 13 presets & a sturdier app',
      'Equalizer z 13 presetami i solidniejsza aplikacja'
    ),
    description: l(
      'A built-in 13-band equalizer with genre presets right in the player, plus a major reliability and security pass — graceful error screens with retry, smoother visualizer and UI, and a hardened internal layer that quietly makes the whole app safer.',
      'Wbudowany 13-pasmowy equalizer z presetami gatunkowymi prosto w odtwarzaczu, a do tego duża fala usprawnień stabilności i bezpieczeństwa — eleganckie ekrany błędów z możliwością ponowienia, płynniejszy wizualizator i interfejs oraz wzmocniona warstwa wewnętrzna, która po cichu czyni aplikację bezpieczniejszą.'
    ),
    categories: [
      {
        label: l('New Features', 'Nowe funkcje'),
        entries: [
          l(
            'Built-in equalizer — open the EQ popover from the player bar to shape sound across 13 frequency bands grouped by musical role (bass, body, presence, air), with 13 ready-made genre presets (Rock, Pop, Jazz, Hip-Hop, Electronic, Classical, Vocal, Lo-Fi and more); the same equalizer is also available from a dedicated section in Settings',
            'Wbudowany equalizer — otwórz popover EQ z paska odtwarzacza, aby kształtować dźwięk na 13 pasmach częstotliwości pogrupowanych według roli muzycznej (bas, ciało, obecność, powietrze), z 13 gotowymi presetami gatunkowymi (Rock, Pop, Jazz, Hip-Hop, Elektronika, Klasyka, Wokal, Lo-Fi i więcej); ten sam equalizer dostępny jest też z dedykowanej sekcji w Ustawieniach'
          ),
          l(
            'Album header now shows year and dominant genre alongside the title',
            'Nagłówek albumu pokazuje teraz rok i dominujący gatunek obok tytułu'
          ),
          l(
            'Player bar adapts to narrow window widths — controls reflow gracefully instead of cramming together',
            'Pasek odtwarzacza dostosowuje się do wąskich okien — kontrolki układają się elegancko zamiast się ściskać'
          ),
          l(
            'Library, Playlists and Mixes show skeleton placeholders while the initial library loads, instead of a brief empty state',
            'Biblioteka, Playlisty i Miksy pokazują szkieletowe placeholdery podczas pierwszego ładowania biblioteki, zamiast krótkiego pustego ekranu'
          ),
        ],
      },
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Every list view now has a proper error state with a retry button when something fails to load — no more blank screens',
            'Każdy widok listy ma teraz właściwy ekran błędu z przyciskiem ponów, gdy coś nie zdąży się załadować — koniec z pustymi ekranami'
          ),
          l(
            'Library sync errors and lyrics fetch failures surface as toast notifications instead of being silently swallowed',
            'Błędy synchronizacji biblioteki i pobierania tekstów są pokazywane jako powiadomienia zamiast być po cichu zignorowane'
          ),
          l(
            'A safety net catches unexpected crashes inside the app and shows a friendly fallback view with reload, instead of a white screen',
            'Siatka bezpieczeństwa wyłapuje nieoczekiwane awarie wewnątrz aplikacji i pokazuje przyjazny ekran zastępczy z możliwością odświeżenia, zamiast białego ekranu'
          ),
          l(
            'Fully redesigned shiranami.app landing page with a cleaner editorial layout, better mobile navigation, and improved readability',
            'W pełni przeprojektowana strona shiranami.app z czytelniejszym edytorskim układem, lepszą nawigacją mobilną i poprawioną czytelnością'
          ),
        ],
      },
      {
        label: l('Performance', 'Wydajność'),
        entries: [
          l(
            'The visualizer pauses automatically when the window is hidden or scrolled out of view, freeing the CPU when nothing is on screen',
            'Wizualizator zatrzymuje się automatycznie, gdy okno jest ukryte lub zjechane poza widok, oddając procesor, gdy nic nie jest pokazywane'
          ),
          l(
            'Faster visualizer rendering — colors and gradients are cached instead of recomputed every frame',
            'Szybsze rysowanie wizualizatora — kolory i gradienty są buforowane zamiast obliczane co klatkę'
          ),
          l(
            'Smoother synced lyrics scrolling — only the active line re-renders instead of the whole list',
            'Płynniejsze przewijanie zsynchronizowanych tekstów — przerysowuje się tylko aktywna linia, a nie cała lista'
          ),
          l(
            'Lighter ambient background — reduced blur, deduplicated gradients and an opt-in noise overlay add up to a noticeably crisper UI',
            'Lżejsze tło ambient — zmniejszone rozmycie, zdeduplikowane gradienty i opcjonalna nakładka szumu razem dają wyraźnie ostrzejszy interfejs'
          ),
          l(
            'Outbound network requests are gently rate-limited per host, so background downloads no longer compete with playback',
            'Wychodzące żądania sieciowe są delikatnie ograniczane dla każdego hosta, więc pobierania w tle nie rywalizują już z odtwarzaniem'
          ),
        ],
      },
      {
        label: l('Security & Stability', 'Bezpieczeństwo i stabilność'),
        entries: [
          l(
            'Hardened internal communication between the app window and its background process — every message is now strictly validated before being acted on',
            'Wzmocniona komunikacja wewnętrzna między oknem aplikacji a procesem w tle — każda wiadomość jest teraz ściśle walidowana przed wykonaniem'
          ),
          l(
            'File access is restricted to your library folders only — paths outside allowed locations are blocked',
            'Dostęp do plików jest ograniczony wyłącznie do folderów Twojej biblioteki — ścieżki poza dozwolonymi lokalizacjami są blokowane'
          ),
          l(
            'Internet radio streams are checked against trusted address ranges to prevent unsafe redirects to internal networks',
            'Strumienie radia internetowego są sprawdzane względem zaufanych zakresów adresów, aby zapobiec niebezpiecznym przekierowaniom do sieci wewnętrznych'
          ),
          l(
            'Improved stability and security of the underlying app components',
            'Poprawiona stabilność i bezpieczeństwo komponentów składowych aplikacji'
          ),
        ],
      },
      {
        label: l('Bug Fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Removing tracks from the library now also removes them from the active playback queue, instead of leaving phantom entries',
            'Usuwanie utworów z biblioteki usuwa je teraz także z aktywnej kolejki odtwarzania, zamiast pozostawiać puste wpisy'
          ),
          l(
            'Album grouping now compares names directly so multi-disc and same-titled albums are sorted predictably regardless of language settings',
            'Grupowanie albumów porównuje teraz nazwy bezpośrednio, więc albumy wielopłytowe i o tej samej nazwie są sortowane przewidywalnie niezależnie od ustawień językowych'
          ),
          l(
            'Landing page polish: clearer mobile menu, hamburger reaches readable contrast, fixed icon rendering on the macOS download tile, and 44px touch targets across the board',
            'Poprawki strony: czytelniejsze menu mobilne, hamburger osiąga czytelny kontrast, naprawione renderowanie ikony na kafelku pobierania macOS oraz 44px wielkości elementów dotykowych w całej stronie'
          ),
        ],
      },
    ],
  },
  {
    version: '0.15.0',
    date: '2026-04-09',
    title: l(
      'Immersive Now Playing view & low-performance mode',
      'Imersyjny widok Teraz odtwarzane i tryb niskiej wydajności'
    ),
    description: l(
      'A full-screen Now Playing experience with synced lyrics, a new low-performance mode for older hardware, finer control over the album grid, a smarter download page, and a safer default for metadata enrichment.',
      'Pełnoekranowy widok Teraz odtwarzane z synchronizowanymi tekstami, nowy tryb niskiej wydajności dla starszego sprzętu, większa kontrola nad siatką albumów, inteligentniejsza strona pobierania oraz bezpieczniejsze domyślne ustawienie wzbogacania metadanych.'
    ),
    categories: [
      {
        label: l('New Features', 'Nowe funkcje'),
        entries: [
          l(
            'Immersive Now Playing view — double-click album art or press Ctrl+Shift+P to open a full-screen player with synced lyrics that scroll and highlight in time with the track; click any line to seek',
            'Imersyjny widok Teraz odtwarzane — kliknij dwukrotnie okładkę lub naciśnij Ctrl+Shift+P, aby otworzyć pełnoekranowy odtwarzacz z synchronizowanymi tekstami, które przewijają się i podświetlają w rytm utworu; kliknięcie dowolnej linii przewija do danego miejsca'
          ),
          l(
            'Low performance mode in Appearance settings — one toggle disables the visualizer, glass blur, background noise overlay and ambient gradients; recommended for older laptops or integrated graphics',
            'Tryb niskiej wydajności w ustawieniach Wyglądu — jeden przełącznik wyłącza wizualizator, rozmycie szkła, nakładkę szumu tła i gradienty tła; zalecany na starszych laptopach lub ze zintegrowaną grafiką'
          ),
          l(
            'Album grid density, sorting and disc number grouping — pick small, medium or large tiles (small finally shows 7–8 columns at 1920px), sort by name, artist or year, and see multi-disc albums grouped correctly with per-disc subheaders',
            'Gęstość, sortowanie i grupowanie numerów płyt w siatce albumów — wybierz małe, średnie lub duże kafelki (małe pokazują wreszcie 7–8 kolumn przy szerokości 1920px), sortuj według nazwy, wykonawcy lub roku, a albumy wielopłytowe są poprawnie grupowane z nagłówkami dla każdej płyty'
          ),
          l(
            'Download page on the landing site now detects your operating system and shows the matching installer directly, with no need to browse GitHub Releases',
            'Strona pobierania na stronie internetowej wykrywa teraz Twój system operacyjny i od razu pokazuje pasujący instalator, bez konieczności przeglądania GitHub Releases'
          ),
          l(
            'Redesigned keyboard shortcuts help dialog with tactile key caps and a cleaner editorial layout matching the app theme',
            'Przeprojektowane okno pomocy skrótów klawiszowych z dotykowymi klawiszami i czytelniejszym edytorskim układem pasującym do motywu aplikacji'
          ),
          l(
            'Mixes and Import Playlist now have keyboard shortcuts (5 and 7) — every item in the sidebar is now reachable from the keyboard',
            'Miksy oraz Import playlisty mają teraz skróty klawiszowe (5 i 7) — każda pozycja z paska bocznego jest teraz dostępna z klawiatury'
          ),
          l(
            'Now Playing banner above Library and Favorites can be hidden — turn it off in Appearance settings to give albums more room',
            'Baner Teraz odtwarzane nad Biblioteką i Ulubionymi można ukryć — wyłącz go w ustawieniach Wyglądu, aby zyskać więcej miejsca na albumy'
          ),
        ],
      },
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Metadata enrichment is now safer by default — writing tags directly to audio files on disk is off by default, requires an explicit opt-in with warning styling, and asks for confirmation naming the exact file count before touching anything',
            'Wzbogacanie metadanych jest teraz bezpieczniejsze domyślnie — zapisywanie tagów bezpośrednio do plików audio jest domyślnie wyłączone, wymaga świadomego włączenia z widocznym ostrzeżeniem i prosi o potwierdzenie z podaną liczbą plików przed jakąkolwiek zmianą'
          ),
          l(
            'Silent keyboard shortcut failures now surface as toast notifications, so actions that did nothing no longer feel broken',
            'Ciche błędy skrótów klawiszowych są teraz pokazywane jako powiadomienia, więc akcje, które nic nie robiły, nie wydają się już zepsute'
          ),
          l(
            'Escape now closes the full-screen Now Playing view first, matching standard modal-style interaction',
            'Klawisz Escape zamyka teraz najpierw pełnoekranowy widok Teraz odtwarzane, zgodnie ze standardowym zachowaniem widoków modalnych'
          ),
          l(
            'Consistent spacing and alignment across Settings cards and Library view toggles',
            'Spójne odstępy i wyrównanie między kartami Ustawień a przełącznikami widoku Biblioteki'
          ),
        ],
      },
      {
        label: l('Bug Fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Downloader now surfaces clear, translated error messages when a track fails (age-restricted, unavailable, no compatible audio format) instead of the opaque "yt-dlp exited with code 1"',
            'Moduł pobierania pokazuje teraz jasne, przetłumaczone komunikaty błędów, gdy pobieranie utworu się nie powiedzie (ograniczenie wiekowe, niedostępny, brak zgodnego formatu audio), zamiast nieczytelnego „yt-dlp exited with code 1"'
          ),
          l(
            'Fixed a stuck loading spinner on player controls that could appear after a failed track load or buffering event',
            'Naprawiono wieczny wskaźnik ładowania na kontrolkach odtwarzacza, który mógł się pojawić po nieudanym załadowaniu utworu lub zdarzeniu buforowania'
          ),
          l(
            'Numeric sidebar navigation shortcuts (1–9) now match the actual sidebar order. Note: keys 5, 6 and 7 changed meaning — 5 is Mixes, 6 is Search, 7 is Import Playlist',
            'Numeryczne skróty nawigacyjne paska bocznego (1–9) odpowiadają teraz rzeczywistej kolejności paska. Uwaga: klawisze 5, 6 i 7 zmieniły znaczenie — 5 to Miksy, 6 to Wyszukiwanie, 7 to Import playlisty'
          ),
        ],
      },
    ],
  },
  {
    version: '0.14.1',
    date: '2026-04-08',
    title: l(
      'Faster tool checks & UI polish',
      'Szybsze sprawdzanie narzędzi i poprawki interfejsu'
    ),
    description: l(
      'Download tool status is now cached in memory and electron-store for instant display on startup, with background refresh. Also fixed toast notification styling and significantly expanded test coverage.',
      'Status narzędzi do pobrania jest teraz buforowany w pamięci i electron-store dla natychmiastowego wyświetlania przy starcie, z odświeżaniem w tle. Poprawiono również stylowanie powiadomień toast i znacząco rozszerzono pokrycie testami.'
    ),
    categories: [
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Download tool status (ffmpeg, yt-dlp) is now cached and shown instantly on startup with skeleton loading, instead of blocking the UI while checking',
            'Status narzędzi do pobrania (ffmpeg, yt-dlp) jest teraz buforowany i wyświetlany natychmiast przy starcie ze szkieletowym ładowaniem, zamiast blokować interfejs podczas sprawdzania'
          ),
          l(
            'Toast notifications now use app design tokens for consistent dark theme styling',
            'Powiadomienia toast używają teraz tokenów projektowych aplikacji dla spójnego stylowania ciemnego motywu'
          ),
        ],
      },
      {
        label: l('Testing', 'Testy'),
        entries: [
          l(
            'Test coverage expanded from 266 to 632 tests across desktop and web packages',
            'Pokrycie testami rozszerzone z 266 do 632 testów w pakietach desktop i web'
          ),
        ],
      },
    ],
  },
  {
    version: '0.14.0',
    date: '2026-04-08',
    title: l(
      'Album grid view & playlist membership',
      'Widok siatki albumów i przynależność do playlist'
    ),
    description: l(
      'Browse your library as album cover art cards, see which playlists a track belongs to from the context menu, and various UI polish improvements.',
      'Przeglądaj swoją bibliotekę jako karty okładek albumów, sprawdzaj do których playlist należy utwór z menu kontekstowego oraz różne poprawki interfejsu.'
    ),
    categories: [
      {
        label: l('New Features', 'Nowe funkcje'),
        entries: [
          l(
            'Album grid view in library — toggle between track list and album cover cards, click an album to see its tracks, with scroll position preserved across navigation',
            'Widok siatki albumów w bibliotece — przełączanie między listą utworów a kartami okładek, kliknij album aby zobaczyć jego utwory, z zachowaniem pozycji przewijania między nawigacjami'
          ),
          l(
            'Playlist membership in context menu — right-click a track to see which playlists it belongs to, with checkmark indicators',
            'Przynależność do playlist w menu kontekstowym — kliknij prawym przyciskiem na utwór, aby zobaczyć do których playlist należy, ze znacznikami wyboru'
          ),
        ],
      },
      {
        label: l('Bug Fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Fixed context menu overflowing viewport on tracks near screen edges',
            'Naprawiono wyświetlanie menu kontekstowego poza ekranem dla utworów blisko krawędzi'
          ),
          l(
            'Fixed playlist popover scroll behavior with portal-based rendering',
            'Naprawiono przewijanie popovera playlist z renderowaniem portalowym'
          ),
          l(
            'Removed redundant playlists button from collapsed sidebar',
            'Usunięto zbędny przycisk playlist ze zwiniętego paska bocznego'
          ),
          l(
            'Used proper Fisher-Yates shuffle for better randomness in album track ordering',
            'Użyto prawidłowego algorytmu Fisher-Yates dla lepszej losowości w kolejności utworów albumów'
          ),
        ],
      },
      {
        label: l('Maintenance', 'Konserwacja'),
        entries: [
          l(
            'Upgraded safe and moderate-effort dependencies to latest versions',
            'Zaktualizowano bezpieczne i umiarkowanie wymagające zależności do najnowszych wersji'
          ),
        ],
      },
    ],
  },
  {
    version: '0.13.1',
    date: '2026-04-08',
    title: l('Reliability & observability improvements', 'Poprawa niezawodności i obserwowalności'),
    description: l(
      'Hardened metadata enrichment with cancellation support and network timeouts, improved library scanning performance, and added comprehensive logging for better debugging.',
      'Wzmocnione wzbogacanie metadanych z obsługą anulowania i limitami czasu sieci, poprawiona wydajność skanowania biblioteki oraz dodano kompleksowe logowanie dla lepszego debugowania.'
    ),
    categories: [
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Cancel button for metadata enrichment — stop long-running batch operations at any time',
            'Przycisk anulowania wzbogacania metadanych — zatrzymaj długotrwałe operacje wsadowe w dowolnym momencie'
          ),
          l(
            'Network requests now have 30-second timeouts and image downloads are capped at 10MB',
            'Żądania sieciowe mają teraz limit 30 sekund, a pobieranie obrazów jest ograniczone do 10MB'
          ),
          l(
            'Comprehensive logging across all features — startup diagnostics, database operations, library scanning with timing, and renderer error capture',
            'Kompleksowe logowanie we wszystkich funkcjach — diagnostyka startu, operacje bazy danych, skanowanie biblioteki z pomiarami czasu oraz przechwytywanie błędów renderera'
          ),
          l(
            'Open logs folder from the About section in settings for easier bug reporting',
            'Otwieranie folderu logów z sekcji O aplikacji w ustawieniach dla łatwiejszego zgłaszania błędów'
          ),
        ],
      },
      {
        label: l('Bug Fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Track number is no longer overwritten when enriching with "only fill missing" enabled',
            'Numer utworu nie jest już nadpisywany podczas wzbogacania z włączoną opcją „tylko brakujące pola"'
          ),
          l(
            'CJK bracket removal in title cleaning now preserves word spacing',
            'Usuwanie nawiasów CJK w czyszczeniu tytułów teraz zachowuje odstępy między słowami'
          ),
          l(
            'iTunes match scoring now uses the cleaned title for better accuracy',
            'Ocena dopasowań iTunes teraz używa oczyszczonego tytułu dla lepszej trafności'
          ),
          l(
            'Year field is now included in the "needs enrichment" filter',
            'Pole roku jest teraz uwzględnione w filtrze „wymaga wzbogacenia"'
          ),
          l(
            'Concurrent library scans are now prevented to avoid duplicate tracks',
            'Jednoczesne skanowania biblioteki są teraz blokowane, aby uniknąć duplikatów utworów'
          ),
        ],
      },
      {
        label: l('Performance', 'Wydajność'),
        entries: [
          l(
            'Bulk track existence check replaces N+1 IPC calls with a single batched query',
            'Zbiorcze sprawdzanie istnienia utworów zastępuje N+1 wywołań IPC jednym zapytaniem wsadowym'
          ),
          l(
            'Database updates during enrichment are now batched in a single transaction',
            'Aktualizacje bazy danych podczas wzbogacania są teraz grupowane w jednej transakcji'
          ),
          l(
            'File validation and subfolder parsing now run with bounded concurrency',
            'Walidacja plików i parsowanie podfolderów teraz działają z ograniczoną współbieżnością'
          ),
        ],
      },
      {
        label: l('Code Quality', 'Jakość kodu'),
        entries: [
          l(
            'Removed dead IPC endpoints and deduplicated subfolder playlist logic',
            'Usunięto martwe endpointy IPC i zdeduplikowano logikę playlist z podfolderów'
          ),
          l(
            'Added test coverage for edge cases: empty arrays, chunk boundaries, and bulk deletion',
            'Dodano pokrycie testowe dla przypadków brzegowych: puste tablice, granice chunków i masowe usuwanie'
          ),
        ],
      },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-04-07',
    title: l(
      'Subfolder playlists & metadata enrichment',
      'Playlisty z podfolderów i wzbogacanie metadanych'
    ),
    description: l(
      'Automatically create playlists from subfolders when scanning music libraries, enrich local track metadata with cover art and details from online sources, and improved library scanning performance.',
      'Automatyczne tworzenie playlist z podfolderów podczas skanowania bibliotek muzycznych, wzbogacanie metadanych lokalnych utworów o okładki i szczegóły ze źródeł online oraz poprawiona wydajność skanowania biblioteki.'
    ),
    categories: [
      {
        label: l('New Features', 'Nowe funkcje'),
        entries: [
          l(
            'Auto-create playlists from subfolders when scanning a music folder — each subfolder becomes its own playlist',
            'Automatyczne tworzenie playlist z podfolderów podczas skanowania folderu z muzyką — każdy podfolder staje się osobną playlistą'
          ),
          l(
            'Metadata enrichment for local tracks (experimental) — fetch cover art and track details from online sources',
            'Wzbogacanie metadanych lokalnych utworów (eksperymentalne) — pobieranie okładek i szczegółów utworów ze źródeł online'
          ),
        ],
      },
      {
        label: l('Bug Fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Stale tracks are now cleaned up during library rescan, removing entries for files that no longer exist on disk',
            'Nieaktualne utwory są teraz usuwane podczas ponownego skanowania biblioteki, usuwając wpisy dla plików, które nie istnieją już na dysku'
          ),
          l(
            'Playlist UI now refreshes correctly after removing a track from the library or disk',
            'Interfejs playlist teraz poprawnie odświeża się po usunięciu utworu z biblioteki lub dysku'
          ),
        ],
      },
      {
        label: l('Performance', 'Wydajność'),
        entries: [
          l(
            'Batched IPC calls and parallelized I/O operations for faster library scanning',
            'Grupowanie wywołań IPC i równoległe operacje I/O dla szybszego skanowania biblioteki'
          ),
          l(
            'Optimized desktop build packaging by reducing dependency tree size',
            'Zoptymalizowano pakowanie kompilacji desktopowej poprzez zmniejszenie rozmiaru drzewa zależności'
          ),
        ],
      },
    ],
  },
  {
    version: '0.12.3',
    date: '2026-04-07',
    title: l('Large library & extraction fix', 'Poprawka dużych bibliotek i ekstrakcji'),
    description: l(
      'Fixed folder import failing for large music libraries and made ffmpeg extraction work on all Windows systems.',
      'Naprawiono błąd importu folderów dla dużych bibliotek muzycznych oraz zapewniono działanie ekstrakcji ffmpeg na wszystkich systemach Windows.'
    ),
    categories: [
      {
        label: l('Bug Fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Fixed "failed to add folder" when importing 3000+ tracks — bulk inserts are now chunked to stay within SQLite limits',
            'Naprawiono błąd „nie udało się dodać folderu" przy importowaniu ponad 3000 utworów — masowe wstawienia są teraz dzielone na partie zgodne z limitami SQLite'
          ),
          l(
            'Fixed ffmpeg extraction failing on systems without `tar` or `powershell` in PATH — now uses a 3-tier fallback: Node.js (adm-zip) → tar → PowerShell',
            'Naprawiono błąd ekstrakcji ffmpeg na systemach bez `tar` lub `powershell` w PATH — teraz używany jest 3-etapowy fallback: Node.js (adm-zip) → tar → PowerShell'
          ),
          l(
            'Fixed folder being saved to database before tracks were added, preventing ghost folder entries on import failure',
            'Naprawiono zapisywanie folderu do bazy danych przed dodaniem utworów, zapobiegając tworzeniu pustych wpisów folderów przy błędzie importu'
          ),
        ],
      },
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Ffmpeg extraction now runs in a worker thread to keep the UI responsive during download',
            'Ekstrakcja ffmpeg działa teraz w wątku roboczym, aby interfejs pozostawał responsywny podczas pobierania'
          ),
          l(
            'Resolved `@types/react` version conflict in CI using `pnpm.packageExtensions` instead of hoist-pattern overrides',
            'Rozwiązano konflikt wersji `@types/react` w CI używając `pnpm.packageExtensions` zamiast nadpisywania wzorców hoistowania'
          ),
        ],
      },
    ],
  },
  {
    version: '0.12.2',
    date: '2026-04-07',
    title: l('Windows compatibility fix', 'Poprawka kompatybilności z Windows'),
    description: l(
      'Fixed ffmpeg extraction failing on some Windows systems, improved test infrastructure, and resolved type-check issues.',
      'Naprawiono błąd ekstrakcji ffmpeg na niektórych systemach Windows, ulepszono infrastrukturę testów i rozwiązano problemy z kontrolą typów.'
    ),
    categories: [
      {
        label: l('Bug Fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Fixed ffmpeg dependency download failing on Windows systems where `tar` is not available — now uses PowerShell `Expand-Archive` instead',
            'Naprawiono błąd pobierania zależności ffmpeg na systemach Windows, gdzie `tar` nie jest dostępny — teraz używany jest PowerShell `Expand-Archive`'
          ),
          l(
            'Fixed `@types/react` version conflict between web and mobile workspaces causing type-check failures in CI',
            "Naprawiono konflikt wersji `@types/react` między workspace'ami web i mobile, powodujący błędy kontroli typów w CI"
          ),
        ],
      },
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Added pure-JS SQLite mock (`sql.js`) for integration tests — no longer depends on native `better-sqlite3` binary matching the Node ABI version',
            'Dodano mock SQLite w czystym JS (`sql.js`) dla testów integracyjnych — nie wymaga już natywnej biblioteki `better-sqlite3` pasującej do wersji ABI Node'
          ),
          l(
            'Added ffmpeg-manager test suite covering extraction, cleanup, and path helpers',
            'Dodano zestaw testów ffmpeg-manager obejmujący ekstrakcję, czyszczenie i helpery ścieżek'
          ),
        ],
      },
    ],
  },
  {
    version: '0.12.1',
    date: '2026-04-01',
    title: l('Security patch', 'Łatka bezpieczeństwa'),
    description: l(
      'Patched transitive dependency vulnerabilities in the server via pnpm overrides.',
      'Załatano podatności w zależnościach pośrednich serwera za pomocą pnpm overrides.'
    ),
    categories: [
      {
        label: l('Security', 'Bezpieczeństwo'),
        entries: [
          l(
            'Fixed path-to-regexp ReDoS vulnerability via pnpm override (8.3.0 → 8.4.0)',
            'Naprawiono podatność ReDoS w path-to-regexp przez pnpm override (8.3.0 → 8.4.0)'
          ),
          l(
            'Fixed fastify request header spoofing vulnerability via pnpm override (5.8.2 → 5.8.3)',
            'Naprawiono podatność na spoofing nagłówków w fastify przez pnpm override (5.8.2 → 5.8.3)'
          ),
        ],
      },
    ],
  },
  {
    version: '0.12.0',
    date: '2026-03-31',
    title: l(
      'Customizable sidebar, better accessibility, and a lot of cleanup',
      'Konfigurowalna nawigacja, lepsza dostępność i sporo porządków'
    ),
    description: l(
      'You can now pick which sidebar items to show or hide entirely. We also spent time fixing accessibility issues, cleaning up inconsistent styling, and breaking the codebase into smaller reusable pieces.',
      'Od teraz możesz wybrać, które elementy nawigacji bocznej mają być widoczne. Poprawiliśmy też dostępność, uporządkowaliśmy niespójne style i rozbiliśmy kod na mniejsze, wielokrotnie używane części.'
    ),
    categories: [
      {
        label: l('New', 'Nowości'),
        entries: [
          l(
            'Sidebar can be customized — toggle individual items on or off from settings',
            'Pasek boczny do konfiguracji — włączaj i wyłączaj poszczególne pozycje w ustawieniach'
          ),
        ],
      },
      {
        label: l('Fixes & Accessibility', 'Poprawki i dostępność'),
        entries: [
          l(
            'Better touch targets and the sidebar now auto-collapses on small screens',
            'Większe cele dotykowe, a nawigacja automatycznie zwija się na małych ekranach'
          ),
          l(
            'Consistent empty states, button sizes, and colors across all views',
            'Spójne puste stany, rozmiary przycisków i kolory we wszystkich widokach'
          ),
          l(
            'Fixed oversized update buttons in settings',
            'Naprawiono za duże przyciski aktualizacji w ustawieniach'
          ),
        ],
      },
      {
        label: l('Under the Hood', 'Pod maską'),
        entries: [
          l(
            'Extracted 7 shared components and hooks to cut down on duplicated code',
            'Wyodrębniono 7 współdzielonych komponentów i hooków, żeby ograniczyć duplikację'
          ),
          l(
            'Hard-coded colors and animations moved to design tokens',
            'Zakodowane na sztywno kolory i animacje przeniesione do tokenów projektowych'
          ),
          l('Added 212 tests across the project', 'Dodano 212 testów w całym projekcie'),
        ],
      },
    ],
  },
  {
    version: '0.11.0',
    date: '2026-03-30',
    title: l(
      'Smart Mixes, new visualizers, and queue drag-and-drop',
      'Inteligentne miksy, nowe wizualizatory i przeciąganie w kolejce'
    ),
    description: l(
      'Auto-generated smart playlists surface your most played, recently added, and undiscovered tracks. Two new visualizer themes join the lineup, and the queue panel now supports drag-and-drop reordering.',
      'Automatycznie generowane inteligentne playlisty wyświetlają najczęściej odtwarzane, ostatnio dodane i nieodkryte utwory. Dwa nowe style wizualizatora dołączają do zestawu, a panel kolejki obsługuje teraz zmianę kolejności przeciąganiem.'
    ),
    categories: [
      {
        label: l('New Features', 'Nowe funkcje'),
        entries: [
          l(
            'Smart Mixes — auto-generated playlists: Most Played, Recently Added, Recently Played, and Never Played',
            'Inteligentne miksy — automatyczne playlisty: Najczęściej odtwarzane, Ostatnio dodane, Ostatnio odtwarzane i Nigdy nie odtwarzane'
          ),
          l(
            'Circle and Wave visualizer themes with radial bars and smooth gradient waveform',
            'Style wizualizatora Okrąg i Fala gradientowa z promieniowymi słupkami i płynną falą'
          ),
          l(
            'Drag-and-drop reordering in the queue Up Next panel',
            'Zmiana kolejności przeciąganiem w panelu Następne w kolejce'
          ),
        ],
      },
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Playlist detail view now shows total duration alongside track count',
            'Widok szczegółów playlisty pokazuje teraz łączny czas trwania obok liczby utworów'
          ),
          l(
            'Visualizer settings grid updated to a 2×2 layout for four themes',
            'Siatka ustawień wizualizatora zaktualizowana do układu 2×2 dla czterech stylów'
          ),
        ],
      },
    ],
  },
  {
    version: '0.10.0',
    date: '2026-03-30',
    title: l(
      'Smarter search, bulk actions, and under-the-hood improvements',
      'Sprawniejsze wyszukiwanie, operacje zbiorcze i poprawki pod maską'
    ),
    description: l(
      'YouTube search now suggests queries as you type, playlists support drag-and-drop reordering, and multi-select lets you act on many tracks at once. Data fetching has been migrated to TanStack Query for snappier navigation.',
      'Wyszukiwanie YouTube podpowiada hasła już w trakcie pisania, playlisty można porządkować przeciąganiem, a wielokrotny wybór pozwala działać na wielu utworach naraz. Przenieśliśmy też pobieranie danych na TanStack Query, żeby nawigacja była szybsza i płynniejsza.'
    ),
    categories: [
      {
        label: l('Search', 'Wyszukiwanie'),
        entries: [
          l(
            "YouTube search autocomplete — suggestions appear as you type, powered by Google's suggest API routed through the main process.",
            'Autouzupełnianie wyszukiwania YouTube — podpowiedzi pojawiają się już podczas pisania dzięki API sugestii Google obsługiwanemu przez proces główny.'
          ),
          l(
            'Clear button (×) on the search input to quickly reset the query.',
            'Przycisk czyszczenia (×) w polu wyszukiwania pozwala jednym kliknięciem wyzerować zapytanie.'
          ),
        ],
      },
      {
        label: l('Playlists', 'Playlisty'),
        entries: [
          l(
            'Drag-and-drop track reordering in playlists — grab a track and move it to any position.',
            'Przestawianie utworów w playlistach metodą przeciągnij i upuść — chwyć utwór i przenieś go w dowolne miejsce.'
          ),
        ],
      },
      {
        label: l('Library', 'Biblioteka'),
        entries: [
          l(
            'Multi-select tracks with bulk actions — select multiple tracks and perform actions like delete, add to playlist, or favorite in one step.',
            'Zaznaczanie wielu utworów i operacje zbiorcze — zaznacz kilka pozycji naraz i jednym ruchem usuń je, dodaj do playlisty albo oznacz jako ulubione.'
          ),
        ],
      },
      {
        label: l('Performance', 'Wydajność'),
        entries: [
          l(
            'Migrated data fetching to TanStack Query across playlists, history, folders, lyrics, and library for faster navigation and smarter caching.',
            'Pobieranie danych w playlistach, historii, folderach, tekstach i bibliotece przenieśliśmy na TanStack Query, żeby przyspieszyć nawigację i poprawić buforowanie.'
          ),
          l(
            'Extracted shared utilities and hooks to reduce code duplication across the app.',
            'Wyciągnęliśmy wspólne narzędzia i hooki, żeby ograniczyć duplikację kodu w całej aplikacji.'
          ),
        ],
      },
      {
        label: l('Bug fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Fixed stuck loading spinner when restoring a paused track on app restart.',
            'Naprawiono zawieszający się spinner ładowania przy przywracaniu wstrzymanego utworu po restarcie aplikacji.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-03-26',
    title: l(
      'Music sharing and multilingual interface',
      'Udostępnianie muzyki i wielojęzyczny interfejs'
    ),
    description: l(
      'Share tracks and playlists with anyone via time-limited links and QR codes. The entire app and landing page now support English and Polish.',
      'Udostępniaj utwory i playlisty przez linki ważne przez określony czas i kody QR. Cała aplikacja oraz strona Shiranami są teraz dostępne po angielsku i po polsku.'
    ),
    categories: [
      {
        label: l('Music sharing', 'Udostępnianie muzyki'),
        entries: [
          l(
            'Share any track or playlist via a time-limited link (1 hour) — right-click a track or use the share button on a playlist.',
            'Udostępnisz dowolny utwór lub playlistę przez link ważny godzinę — kliknij prawym przyciskiem utwór albo skorzystaj z przycisku udostępniania na playliście.'
          ),
          l(
            'Share dialog with copyable link and scannable QR code for easy sharing on any device.',
            'Okno udostępniania zawiera link do skopiowania i kod QR do zeskanowania, więc łatwo podeślesz muzykę na dowolne urządzenie.'
          ),
          l(
            'Web preview page at the share link shows track listing, artist info, and an "Open in Shiranami" button with deep link support.',
            'Podgląd pod linkiem udostępniania pokazuje listę utworów, informacje o wykonawcy i przycisk „Otwórz w Shiranami” z obsługą deep linków.'
          ),
          l(
            'Import shared music directly into your library — downloads tracks from YouTube and creates a playlist with a custom name.',
            'Zaimportujesz udostępnioną muzykę prosto do biblioteki — aplikacja pobierze utwory z YouTube i utworzy playlistę z własną nazwą.'
          ),
          l(
            'YouTube video IDs are cached at download time for accurate sharing — the exact same video you downloaded is shared.',
            'Identyfikatory filmów YouTube są zapisywane przy pobieraniu — udostępniany jest dokładnie ten sam film, który pobrałeś.'
          ),
        ],
      },
      {
        label: l('Internationalization', 'Internacjonalizacja'),
        entries: [
          l(
            'Full Polish translation of the entire app — all UI strings, tooltips, toast messages, error messages, and empty states.',
            'Pełne polskie tłumaczenie całej aplikacji — od napisów w interfejsie po podpowiedzi, toasty, komunikaty błędów i puste stany.'
          ),
          l(
            'Language switcher in Settings — switch between English and Polish instantly.',
            'Przełącznik języka w Ustawieniach pozwala od ręki przełączać się między angielskim a polskim.'
          ),
          l(
            'Landing page available in both English and Polish with language toggle.',
            'Strona Shiranami jest dostępna po angielsku i po polsku, z prostym przełącznikiem języka.'
          ),
        ],
      },
      {
        label: l('Infrastructure', 'Infrastruktura'),
        entries: [
          l(
            'New share server (NestJS + PostgreSQL + Redis) with rate limiting, Redis caching, and automatic cleanup of expired shares.',
            'Nowy serwer udostępniania (NestJS + PostgreSQL + Redis) ma limitowanie żądań, cache w Redisie i automatyczne czyszczenie wygasłych linków.'
          ),
          l(
            'Docker-ready deployment with multi-stage Dockerfile and docker-compose for the share server.',
            'Wdrożenie jest gotowe pod Dockera dzięki wieloetapowemu Dockerfile i `docker-compose` dla serwera udostępniania.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-03-26',
    title: l(
      'Keyboard shortcuts, quick favorite, and search improvements',
      'Skróty klawiszowe, szybkie ulubione i lepsze wyszukiwanie'
    ),
    description: l(
      'Navigate and control playback entirely from the keyboard, favorite tracks directly from the player bar, and see view counts on search results.',
      'Steruj odtwarzaniem w całości z klawiatury, dodawaj utwory do ulubionych prosto z paska odtwarzacza i sprawdzaj liczbę wyświetleń w wynikach wyszukiwania.'
    ),
    categories: [
      {
        label: l('Keyboard shortcuts', 'Skróty klawiszowe'),
        entries: [
          l(
            'Full keyboard shortcut system — Space to play/pause, arrow keys for seeking and volume, M to mute, N/P for next/previous, S for shuffle, R for repeat, and more.',
            'Pełny zestaw skrótów klawiszowych — spacja do odtwarzania i pauzy, strzałki do przewijania i sterowania głośnością, M do wyciszenia, N/P do następnego lub poprzedniego utworu, S do losowania, R do powtarzania i nie tylko.'
          ),
          l(
            'Press ? to open a help overlay listing all available shortcuts, organized by category.',
            'Naciśnij ?, aby otworzyć nakładkę pomocy z listą wszystkich dostępnych skrótów podzielonych na kategorie.'
          ),
          l(
            'Number keys 1–7 for quick navigation between views (Library, Playlists, Favorites, History, Download, Radio, Settings).',
            'Klawisze 1–7 pozwalają błyskawicznie przełączać się między widokami: Biblioteką, Playlistami, Ulubionymi, Historią, Pobieraniem, Radiem i Ustawieniami.'
          ),
          l(
            'Modifier shortcuts for panels: Ctrl+B (sidebar), Ctrl+L (lyrics), Ctrl+Q (queue), Ctrl+Shift+M (compact mode), V (visualizer).',
            'Skróty z modyfikatorem dla paneli: Ctrl+B (pasek boczny), Ctrl+L (teksty), Ctrl+Q (kolejka), Ctrl+Shift+M (tryb kompaktowy), V (wizualizator).'
          ),
          l(
            'Platform-aware labels — shortcuts display ⌘ on macOS and Ctrl on Windows/Linux.',
            'Oznaczenia skrótów są zależne od platformy — na macOS wyświetlamy ⌘, a na Windowsie i Linuksie Ctrl.'
          ),
          l(
            'All player bar buttons now show their keyboard shortcut in tooltips.',
            'Wszystkie przyciski na pasku odtwarzacza pokazują teraz swój skrót w podpowiedziach.'
          ),
        ],
      },
      {
        label: l('Player bar', 'Pasek odtwarzacza'),
        entries: [
          l(
            'New favorite button next to track info in the player bar — quickly heart or unheart the current track without leaving your view.',
            'Obok informacji o utworze na pasku odtwarzacza pojawił się przycisk ulubionych — możesz szybko dodać albo usunąć serduszko bez opuszczania bieżącego widoku.'
          ),
          l(
            'Fixed playlist detail view not reflecting favorite changes in real-time when toggled from the player bar or keyboard shortcut.',
            'Naprawiono widok szczegółów playlisty, który nie odświeżał na żywo zmian w ulubionych po użyciu paska odtwarzacza albo skrótu klawiszowego.'
          ),
        ],
      },
      {
        label: l('Search', 'Wyszukiwanie'),
        entries: [
          l(
            'YouTube search results now display view counts next to the uploader name (e.g. "1.2M views") for quick popularity reference.',
            'Wyniki wyszukiwania w YouTube pokazują teraz liczbę wyświetleń obok nazwy kanału (np. „1,2 mln wyświetleń”), żeby szybciej ocenić popularność.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.7.1',
    date: '2026-03-26',
    title: l('Crossfade audio fix', 'Poprawka dźwięku przy crossfade'),
    description: l(
      'Fixes a critical bug where enabling crossfade caused permanent audio loss after the first track transition.',
      'Naprawia krytyczny błąd, przez który włączenie crossfade’u powodowało utratę dźwięku po pierwszym przejściu między utworami.'
    ),
    categories: [
      {
        label: l('Bug fixes', 'Poprawki błędów'),
        entries: [
          l(
            "Fixed permanent audio loss when crossfade is enabled — the idle deck's volume was zeroed before the Web Audio graph captured it, silencing all subsequent playback until restart.",
            'Naprawiono trwałą utratę dźwięku po włączeniu crossfade’u — głośność nieaktywnego decka była zerowana, zanim graf Web Audio zdążył ją przechwycić, więc kolejne utwory milczały aż do restartu.'
          ),
          l(
            'Fixed a race condition where cached audio could fire canplay before the crossfade state was set, preventing the incoming deck from starting.',
            'Naprawiono warunek wyścigu, w którym zbuforowane audio mogło wywołać `canplay`, zanim ustawiono stan crossfade’u, przez co wchodzący deck nie startował.'
          ),
          l(
            "Fixed potential double track-advance when the outgoing deck's ended event fired after crossfade completion.",
            'Naprawiono możliwe podwójne przejście do kolejnego utworu, gdy zdarzenie `ended` wychodzącego decka uruchamiało się już po zakończeniu crossfade’u.'
          ),
          l(
            'The AudioContext is now explicitly resumed before every play operation to prevent Chromium power-saving from killing audio output.',
            'Przed każdym odtworzeniem `AudioContext` jest teraz jawnie wznawiany, żeby oszczędzanie energii w Chromium nie odcinało wyjścia audio.'
          ),
          l(
            'Crossfade completion now verifies the incoming deck is actually playing and syncs the correct track duration to the UI.',
            'Po zakończeniu crossfade’u aplikacja sprawdza teraz, czy wchodzący deck naprawdę gra, i synchronizuje z interfejsem prawidłowy czas trwania utworu.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-03-26',
    title: l(
      'Crossfade, sleep timer, and quality-of-life improvements',
      'Crossfade, wyłącznik czasowy i usprawnienia na co dzień'
    ),
    description: l(
      'Smooth transitions between tracks with a new crossfade engine, wind down with a built-in sleep timer, and fine-tune the interface to your liking.',
      'Płynnie przechodź między utworami dzięki nowemu silnikowi crossfade’u, wycisz wieczór wbudowanym wyłącznikiem czasowym i dopasuj interfejs do własnych preferencji.'
    ),
    categories: [
      {
        label: l('Crossfade', 'Crossfade'),
        entries: [
          l(
            'Dual-deck audio engine with equal-power crossfade between tracks — toggle and adjust duration (1-12s) in Settings > Playback.',
            'Dwudeckowy silnik audio z crossfade’em o równej mocy między utworami — możesz go włączyć i ustawić czas trwania (1–12 s) w Ustawienia > Odtwarzanie.'
          ),
          l(
            'Both decks route through Web Audio GainNodes for smooth volume ramps and merged visualizer output during transitions.',
            'Oba decki są prowadzone przez `GainNode` w Web Audio, co pozwala na płynne zmiany głośności i wspólne wyjście do wizualizatora podczas przejść.'
          ),
          l(
            'Crossfade automatically skips for radio streams, repeat-one mode, and tracks shorter than the fade duration.',
            'Crossfade jest automatycznie pomijany dla strumieni radiowych, trybu powtarzania jednego utworu i nagrań krótszych niż ustawiony czas przejścia.'
          ),
        ],
      },
      {
        label: l('Sleep timer', 'Wyłącznik czasowy'),
        entries: [
          l(
            'New sleep timer in the player bar with 15, 30, 45, 60, and 90-minute presets.',
            'Nowy wyłącznik czasowy na pasku odtwarzacza z presetami 15, 30, 45, 60 i 90 minut.'
          ),
          l(
            'Shows a live countdown in the tooltip and a pulsing indicator when active. Playback pauses automatically when the timer expires.',
            'Pokazuje odliczanie na żywo w podpowiedzi i pulsujący wskaźnik, gdy jest aktywny. Odtwarzanie zatrzymuje się automatycznie po upływie czasu.'
          ),
        ],
      },
      {
        label: l('Interface', 'Interfejs'),
        entries: [
          l(
            'New Appearance section in Settings with an interface scale slider (80–120%) for adjusting text and UI element sizes.',
            'Nowa sekcja Wygląd w ustawieniach z suwakiem skali interfejsu (80–120%), który pozwala dopasować rozmiar tekstu i elementów UI.'
          ),
          l(
            'Update notifications now appear as toasts when a new version is detected, with a quick link to Settings.',
            'Powiadomienia o aktualizacjach pojawiają się teraz jako toasty po wykryciu nowej wersji i zawierają szybki odnośnik do ustawień.'
          ),
        ],
      },
      {
        label: l('Performance', 'Wydajność'),
        entries: [
          l(
            'Desktop main process bundle reduced from 2.0 MB to 568 KB by externalizing npm dependencies at build time.',
            'Paczkę głównego procesu desktopowego zmniejszyliśmy z 2,0 MB do 568 KB, wynosząc zależności npm poza bundel na etapie budowania.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.6.1',
    date: '2026-03-23',
    title: l('Library search and command palette', 'Wyszukiwanie w bibliotece i paleta poleceń'),
    description: l(
      'Find any track in seconds with a new inline library filter and a global command palette you can open from anywhere.',
      'Znajdź dowolny utwór w kilka sekund dzięki nowemu filtrowi w bibliotece i globalnej palecie poleceń dostępnej z każdego miejsca.'
    ),
    categories: [
      {
        label: l('Search', 'Wyszukiwanie'),
        entries: [
          l(
            'The library view now has an inline search bar that instantly filters tracks by title, artist, or album — with a result count and a clear button.',
            'Widok biblioteki ma teraz wbudowany pasek wyszukiwania, który natychmiast filtruje utwory po tytule, artyście lub albumie — razem z licznikiem wyników i przyciskiem czyszczenia.'
          ),
          l(
            'A global command palette (Ctrl+K / Cmd+K) lets you search and play any track from any view, or quickly navigate to Library, Favorites, Playlists, and more.',
            'Globalna paleta poleceń (Ctrl+K / Cmd+K) pozwala wyszukać i odtworzyć dowolny utwór z każdego widoku albo szybko przejść do Biblioteki, Ulubionych, Playlist i innych miejsc.'
          ),
          l(
            'Playing from filtered results sets the queue to the matching subset so next/previous stay within your search.',
            'Odtwarzanie z przefiltrowanych wyników ustawia kolejkę na dopasowany podzbiór, dzięki czemu następny i poprzedni utwór pozostają w obrębie bieżącego wyszukiwania.'
          ),
        ],
      },
      {
        label: l('Bug fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Fixed Discord Rich Presence failing in a loop when a track had a very short or empty artist field (Discord requires at least 2 characters).',
            'Naprawiono zapętlające się błędy Discord Rich Presence, gdy utwór miał bardzo krótkie albo puste pole artysty (Discord wymaga co najmniej 2 znaków).'
          ),
          l(
            'Fixed a TypeError on hot-module reload caused by Vite 7 making import.meta.hot.data read-only.',
            'Naprawiono `TypeError` przy hot reloaderze modułów, bo Vite 7 traktuje `import.meta.hot.data` jako tylko do odczytu.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-03-21',
    title: l('Compact mode and listening history', 'Tryb kompaktowy i historia słuchania'),
    description: l(
      'Keep Shiranami close at hand with a dedicated compact player, then look back on your listening habits with a new history and stats view.',
      'Miej Shiranami zawsze pod ręką dzięki dedykowanemu mini odtwarzaczowi, a potem wracaj do swoich nawyków słuchania w nowym widoku historii i statystyk.'
    ),
    categories: [
      {
        label: l('Compact mode', 'Tryb kompaktowy'),
        entries: [
          l(
            'Switch the main window into a dedicated compact player layout with art, transport controls, volume, and a tighter scrub bar.',
            'Główne okno można teraz przełączyć w dedykowany mini odtwarzacz z okładką, kontrolkami odtwarzania, głośnością i bardziej zwartym paskiem przewijania.'
          ),
          l(
            'Compact mode restores your previous window bounds when you exit and includes an always-on-top toggle for desk-side playback.',
            'Po wyjściu z trybu kompaktowego aplikacja przywraca poprzedni rozmiar i pozycję okna, a do tego oferuje przełącznik „zawsze na wierzchu”.'
          ),
          l(
            'The compact layout received multiple spacing and truncation passes so controls stay readable without overflowing the card.',
            'Układ kompaktowy dostał serię poprawek odstępów i przycinania tekstu, dzięki czemu kontrolki pozostają czytelne i nie wychodzą poza kartę.'
          ),
        ],
      },
      {
        label: l('History and stats', 'Historia i statystyki'),
        entries: [
          l(
            'A new History view shows recent plays, top tracks, top artists, and key listening totals.',
            'Nowy widok Historii pokazuje ostatnie odsłuchania, najczęściej słuchane utwory, najpopularniejszych artystów i najważniejsze statystyki słuchania.'
          ),
          l(
            'Stats support 7-day, 30-day, and all-time ranges, plus a daily activity graph for quick trends.',
            'Statystyki obsługują zakres 7 dni, 30 dni i cały okres, a dodatkowo pokazują wykres dziennej aktywności, żeby szybciej wychwycić trendy.'
          ),
          l(
            'Listening history is recorded from meaningful sessions instead of every skip, producing cleaner stats.',
            'Historia słuchania zapisuje tylko sensowne odsłuchy zamiast każdego pominięcia, dzięki czemu statystyki są czytelniejsze.'
          ),
        ],
      },
      {
        label: l('Quality', 'Jakość'),
        entries: [
          l(
            'Added a shared Vitest workspace with initial coverage for web UI, desktop IPC, shared utilities, and database logic.',
            'Dodano wspólny workspace Vitest z pierwszym zestawem testów dla webowego UI, desktopowego IPC, współdzielonych narzędzi i logiki bazy danych.'
          ),
          l(
            'Release safety improved with automated checks around compact mode state, radio loading UI, seek bar behavior, and listening-history queries.',
            'Bezpieczeństwo wydań poprawiliśmy dzięki automatycznym sprawdzeniom stanu trybu kompaktowego, UI ładowania radia, działania paska przewijania i zapytań do historii słuchania.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.5.1',
    date: '2026-03-21',
    title: l('Radio and playback polish', 'Radio i dopracowanie odtwarzania'),
    description: l(
      'A focused polish patch for smoother scrubbing, cleaner Windows window controls, and a more responsive radio browsing flow.',
      'Niewielka poprawka skupiona na płynniejszym przewijaniu, lepiej dopracowanych kontrolkach okna w Windowsie i sprawniejszym przeglądaniu radia.'
    ),
    categories: [
      {
        label: l('Player', 'Odtwarzacz'),
        entries: [
          l(
            'The player seek thumb now snaps straight to the scrubbed position instead of visibly sliding from the old timestamp.',
            'Uchwyt paska przewijania od razu przeskakuje do wybranej pozycji zamiast widocznie dosuwać się od poprzedniego czasu.'
          ),
        ],
      },
      {
        label: l('Radio', 'Radio'),
        entries: [
          l(
            'Switching between Top Stations, By Country, and Favorites now shows skeleton rows while results load.',
            'Przełączanie między Popularnymi stacjami, Według kraju i Ulubionymi pokazuje teraz placeholdery wierszy podczas ładowania wyników.'
          ),
          l(
            'Fast tab and country changes no longer let stale radio requests overwrite the newest selection.',
            'Szybkie zmiany zakładek i krajów nie pozwalają już, by stare żądania radia nadpisywały najnowszy wybór.'
          ),
          l(
            'The country picker now uses the same shared select styling as the rest of the app instead of a native browser dropdown.',
            'Wybór kraju korzysta teraz z tego samego stylu selecta co reszta aplikacji zamiast z natywnej listy przeglądarki.'
          ),
        ],
      },
      {
        label: l('Interface', 'Interfejs'),
        entries: [
          l(
            'Windows title bar controls have been resized and balanced so minimize, maximize, and close feel more consistent.',
            'Kontrolki paska tytułu w Windowsie zostały przeskalowane i lepiej wyważone, dzięki czemu minimalizacja, maksymalizacja i zamknięcie są bardziej spójne.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-03-20',
    title: l('Playlist import and library cleanup', 'Import playlist i porządki w bibliotece'),
    description: l(
      'Bring whole playlists in from YouTube or Spotify, review the batch before downloading, and clean up downloaded files with a safer delete flow.',
      'Importuj całe playlisty z YouTube lub Spotify, przejrzyj paczkę przed pobraniem i porządkuj pobrane pliki w bezpieczniejszym procesie usuwania.'
    ),
    categories: [
      {
        label: l('Playlist import', 'Import playlist'),
        entries: [
          l(
            'Import full playlists from YouTube and Spotify links into your library.',
            'Importuj do biblioteki całe playlisty z linków YouTube i Spotify.'
          ),
          l(
            'Preview tracks before downloading and remove individual entries from the import list.',
            'Odsłuchuj utwory przed pobraniem i usuwaj pojedyncze pozycje z listy importu.'
          ),
          l(
            'Large YouTube playlists no longer stop at the first 100 tracks.',
            'Duże playlisty YouTube nie zatrzymują się już na pierwszych 100 utworach.'
          ),
        ],
      },
      {
        label: l('Library', 'Biblioteka'),
        entries: [
          l(
            'Delete from Disk sends tracks to the recycle bin from the context menu.',
            'Opcja „Usuń z dysku” przenosi teraz utwory do kosza z poziomu menu kontekstowego.'
          ),
          l(
            'The delete flow now keeps the library entry intact if moving the file fails.',
            'Proces usuwania zachowuje teraz wpis w bibliotece, jeśli przeniesienie pliku się nie powiedzie.'
          ),
        ],
      },
      {
        label: l('Polish', 'Dopracowanie'),
        entries: [
          l(
            'Playlist import lists stay smooth on larger batches thanks to virtualization.',
            'Listy importu playlist pozostają płynne przy większych paczkach dzięki wirtualizacji.'
          ),
          l(
            'Top bar titles are now correct in the Import Playlist and Radio views.',
            'Tytuły na górnym pasku są teraz poprawne w widokach Import playlisty i Radia.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-03-20',
    title: l('Discord Rich Presence', 'Discord Rich Presence'),
    description: l(
      "Show what you're listening to on Discord, plus a smoother playlist submenu experience.",
      'Pokaż na Discordzie, czego słuchasz, i korzystaj z płynniej działającego podmenu playlist.'
    ),
    categories: [
      {
        label: l('Discord', 'Discord'),
        entries: [
          l(
            'Discord Rich Presence shows the current track name, artist, album, and time remaining.',
            'Discord Rich Presence pokazuje nazwę aktualnego utworu, artystę, album i pozostały czas.'
          ),
          l(
            'Connects automatically on app start with reconnection on disconnect.',
            'Łączy się automatycznie przy starcie aplikacji i ponawia połączenie po rozłączeniu.'
          ),
          l(
            'Enable or disable it from the Playback section in Settings (off by default).',
            'Możesz go włączyć lub wyłączyć w sekcji Odtwarzanie w ustawieniach (domyślnie jest wyłączony).'
          ),
        ],
      },
      {
        label: l('Fixes', 'Poprawki'),
        entries: [
          l(
            'The "Add to Playlist" submenu no longer disappears when moving the mouse to it.',
            'Podmenu „Dodaj do playlisty” nie znika już przy przenoszeniu na nie kursora.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.3.1',
    date: '2026-03-20',
    title: l(
      'Search preview and quality-of-life tweaks',
      'Podgląd wyszukiwania i drobne usprawnienia'
    ),
    description: l(
      'Preview search results before downloading, and quickly check what changed when an update is available.',
      'Odsłuchuj wyniki wyszukiwania przed pobraniem i szybko sprawdzaj, co się zmieniło, gdy pojawi się aktualizacja.'
    ),
    categories: [
      {
        label: l('Search', 'Wyszukiwanie'),
        entries: [
          l(
            'Preview audio directly from search results by clicking the thumbnail — no download required.',
            'Odsłuchuj dźwięk bezpośrednio z wyników wyszukiwania po kliknięciu miniatury — bez konieczności pobierania.'
          ),
          l(
            'Playback streams through the existing radio protocol so previews work instantly with the player bar.',
            'Podglądy są odtwarzane przez istniejący protokół radiowy, więc od razu działają z paskiem odtwarzacza.'
          ),
        ],
      },
      {
        label: l('Updates', 'Aktualizacje'),
        entries: [
          l(
            'A "View changelog" link now appears in Settings when an update is available, opening the Shiranami website changelog.',
            'W Ustawieniach pojawia się teraz link „Zobacz historię zmian”, gdy dostępna jest aktualizacja; otwiera changelog na stronie Shiranami.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-03-20',
    title: l(
      'Internet radio and performance overhaul',
      'Radio internetowe i przebudowa wydajności'
    ),
    description: l(
      'Stream internet radio stations, enjoy faster rendering with protocol-based album art, and benefit from a leaner build powered by esbuild.',
      'Słuchaj stacji radia internetowego, korzystaj z szybszego renderowania dzięki okładkom serwowanym przez własny protokół i z lżejszej kompilacji opartej na esbuildzie.'
    ),
    categories: [
      {
        label: l('Radio', 'Radio'),
        entries: [
          l(
            'Stream internet radio stations via the Radio Browser API with a dedicated Radio view.',
            'Słuchaj stacji radia internetowego przez API Radio Browser w osobnym widoku Radia.'
          ),
          l(
            'Search, browse, and favorite radio stations — favorites persist in the local database.',
            'Wyszukuj, przeglądaj i dodawaj stacje do ulubionych — ulubione zapisują się w lokalnej bazie danych.'
          ),
          l(
            'Radio playback integrates with the existing player bar and audio engine.',
            'Odtwarzanie radia integruje się z istniejącym paskiem odtwarzacza i silnikiem audio.'
          ),
        ],
      },
      {
        label: l('Performance', 'Wydajność'),
        entries: [
          l(
            'Album art is now served via a custom protocol instead of base64 blobs, reducing memory usage.',
            'Okładki albumów są teraz serwowane przez własny protokół zamiast blobów base64, co zmniejsza zużycie pamięci.'
          ),
          l(
            'Throttled playback store updates, memoized components, and virtualized the queue panel.',
            'Ograniczono liczbę aktualizacji store’a odtwarzania, zmemoizowano komponenty i zwirtualizowano panel kolejki.'
          ),
          l(
            'Main process is bundled with esbuild; icon assets optimized from ~885 KB down to ~176 KB.',
            'Główny proces bundlujemy teraz esbuildem, a zasoby ikon zoptymalizowaliśmy z około 885 KB do około 176 KB.'
          ),
        ],
      },
      {
        label: l('Bug fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Fixed LRU lyrics cache promoting existing keys and avoiding incorrect eviction.',
            'Naprawiono pamięć podręczną tekstów opartą o LRU, tak aby poprawnie promowała istniejące klucze i nie usuwała błędnych wpisów.'
          ),
          l(
            'Enabled Electron fuses for security hardening.',
            'Włączono fuse’y Electrona dla dodatkowego utwardzenia bezpieczeństwa.'
          ),
          l(
            'Deduplicated ambient color hook to prevent redundant canvas draws.',
            'Usunięto duplikację hooka odpowiadającego za kolory ambient, żeby uniknąć zbędnych renderów canvasa.'
          ),
          l(
            'Fixed CSP img-src to allow the new art protocol.',
            'Naprawiono regułę `img-src` w CSP, aby dopuścić nowy protokół okładek.'
          ),
          l(
            'Synced app version labels across settings, sidebar, and landing page.',
            'Zsynchronizowano oznaczenia wersji aplikacji między ustawieniami, paskiem bocznym i stroną landingową.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.2.1',
    date: '2026-03-19',
    title: l('Quick fix', 'Szybka poprawka'),
    description: l(
      'Removed the duplicate play/pause button from the favorites hero card — playback controls now live in the player bar only.',
      'Usunięto zduplikowany przycisk odtwarzania i pauzy z karty głównej ulubionych — kontrolki odtwarzania znajdują się teraz wyłącznie na pasku odtwarzacza.'
    ),
    categories: [
      {
        label: l('Interface', 'Interfejs'),
        entries: [
          l(
            'Removed duplicate play/pause button from the favorites "Now Playing" card for consistency with the library view.',
            'Usunięto zduplikowany przycisk odtwarzania i pauzy z karty „Teraz odtwarzane” w ulubionych, żeby zachować spójność z widokiem biblioteki.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-03-19',
    title: l(
      'Settings redesign and audio visualizer',
      'Przeprojektowane ustawienia i wizualizator dźwięku'
    ),
    description: l(
      'A polish pass on the desktop experience — the settings page got a full redesign, and the audio visualizer now has two styles to match your mood.',
      'Dopracowaliśmy desktopowe doświadczenie — strona ustawień została całkowicie przeprojektowana, a wizualizator dźwięku ma teraz dwa style, które możesz dobrać do nastroju.'
    ),
    categories: [
      {
        label: l('Visualizer', 'Wizualizator'),
        entries: [
          l(
            'Two visualizer styles: soft frequency bars and a dense waveform inspired by ElevenLabs UI.',
            'Dwa style wizualizatora: delikatne słupki częstotliwości i gęsta fala inspirowana interfejsem ElevenLabs.'
          ),
          l(
            'Style picker in Settings lets you switch between bars and waveform.',
            'Przełącznik stylu w ustawieniach pozwala wybierać między słupkami a falą.'
          ),
          l(
            'Redesigned bar visualizer with center alignment, edge fading, and softer glow.',
            'Przeprojektowany wizualizator słupkowy z wyrównaniem do środka, wygaszaniem na krawędziach i łagodniejszą poświatą.'
          ),
          l(
            'Visualizer toggle and style preference persist across restarts.',
            'Włączenie wizualizatora i wybrany styl są zapamiętywane po restarcie aplikacji.'
          ),
          l(
            'Content no longer hides behind the visualizer strip.',
            'Treść nie chowa się już pod paskiem wizualizatora.'
          ),
        ],
      },
      {
        label: l('Settings', 'Ustawienia'),
        entries: [
          l(
            'Settings page redesigned with sidebar tab navigation.',
            'Strona ustawień została przeprojektowana i korzysta teraz z nawigacji zakładkami w pasku bocznym.'
          ),
          l(
            'Each section (Folders, Library, Downloads, Playback, Visualizer, Updates, About) is now its own panel.',
            'Każda sekcja (Foldery, Biblioteka, Pobieranie, Odtwarzanie, Wizualizator, Aktualizacje, O aplikacji) jest teraz osobnym panelem.'
          ),
          l(
            'Download tools section refactored with cleaner status rows and progress bars.',
            'Sekcja narzędzi pobierania została przebudowana i ma czytelniejsze wiersze statusu oraz paski postępu.'
          ),
          l(
            'New reusable Switch component with spring animation.',
            'Dodano nowy, wielokrotnego użytku komponent `Switch` z animacją sprężynową.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-03-19',
    title: l('First public release', 'Pierwsze publiczne wydanie'),
    description: l(
      'The first release focuses on turning Shiranami into a stable desktop sanctuary for local listening, playlists, synced lyrics, and one-step downloads.',
      'Pierwsze wydanie skupia się na tym, żeby Shiranami stało się stabilną desktopową przystanią do lokalnego słuchania, playlist, zsynchronizowanych tekstów i pobierania jednym kliknięciem.'
    ),
    categories: [
      {
        label: l('Player and library', 'Odtwarzacz i biblioteka'),
        entries: [
          l(
            'Playback resume restores the selected track, queue, position, and volume after relaunch.',
            'Wznawianie odtwarzania przywraca po ponownym uruchomieniu wybrany utwór, kolejkę, pozycję i głośność.'
          ),
          l(
            'Volume and mute state persist between sessions instead of snapping back to 100%.',
            'Stan głośności i wyciszenia jest zapamiętywany między sesjami zamiast wracać do 100%.'
          ),
          l(
            'Library rescans and search downloads show up immediately without requiring a restart.',
            'Ponowne skanowanie biblioteki i pobrania z wyszukiwania pojawiają się od razu, bez potrzeby restartu.'
          ),
          l(
            'The loading spinner on the main transport controls now stays in sync with real playback state.',
            'Spinner ładowania na głównych kontrolkach transportu pozostaje teraz zsynchronizowany z rzeczywistym stanem odtwarzania.'
          ),
        ],
      },
      {
        label: l('Search and downloads', 'Wyszukiwanie i pobieranie'),
        entries: [
          l(
            'yt-dlp and ffmpeg install together in one guided flow when search tools are missing.',
            'Gdy brakuje narzędzi do wyszukiwania, yt-dlp i ffmpeg instalują się razem w jednym, prowadzonym procesie.'
          ),
          l(
            'Download progress stays visible across view changes instead of resetting with navigation.',
            'Postęp pobierania pozostaje widoczny po zmianie widoków zamiast resetować się przy nawigacji.'
          ),
          l(
            'yt-dlp and ffmpeg update buttons now check upstream versions instead of blindly redownloading.',
            'Przyciski aktualizacji yt-dlp i ffmpeg sprawdzają teraz wersje upstream zamiast w ciemno pobierać wszystko od nowa.'
          ),
          l(
            'The download folder is configurable from settings, with a reset option back to the default location.',
            'Folder pobierania można skonfigurować z poziomu ustawień, a w razie potrzeby przywrócić domyślną lokalizację.'
          ),
        ],
      },
      {
        label: l('Playlists and interface', 'Playlisty i interfejs'),
        entries: [
          l(
            'Playlists support custom covers and quick access from the sidebar.',
            'Playlisty obsługują własne okładki i szybki dostęp z paska bocznego.'
          ),
          l(
            'The sidebar can collapse into an icon rail while keeping playlist shortcuts reachable.',
            'Pasek boczny może zwijać się do kolumny ikon, nadal zachowując skróty do playlist pod ręką.'
          ),
          l(
            'The lyrics panel is closed by default so the app opens into a cleaner listening view.',
            'Panel z tekstem jest domyślnie zamknięty, dzięki czemu aplikacja otwiera się w czystszym widoku do słuchania.'
          ),
          l(
            'Playback resume waits until the splash screen finishes instead of starting underneath it.',
            'Wznawianie odtwarzania czeka teraz na zakończenie splash screena zamiast startować pod nim.'
          ),
        ],
      },
      {
        label: l('Packaging and release readiness', 'Pakietowanie i gotowość do wydań'),
        entries: [
          l(
            'Packaged Windows builds now bundle the correct tray icon assets.',
            'Wydania dla Windowsa zawierają teraz poprawne zasoby ikon zasobnika.'
          ),
          l(
            'Release workflows build desktop artifacts from tags and upload them back to GitHub Releases.',
            'Proces wydawniczy buduje artefakty desktopowe z tagów i wysyła je z powrotem do GitHub Releases.'
          ),
          l(
            'Workspace version bumping and CI-side version syncing now cover the landing page too.',
            'Podbijanie wersji w workspace i synchronizacja wersji po stronie CI obejmują teraz także stronę landingową.'
          ),
          l(
            'A dedicated landing site and static hosting Dockerfile are part of the repository.',
            'Repozytorium zawiera teraz dedykowaną stronę landingową i Dockerfile do statycznego hostingu.'
          ),
        ],
      },
    ],
  },
];
