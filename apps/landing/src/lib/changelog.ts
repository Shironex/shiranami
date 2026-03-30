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

export const changelog: ChangelogRelease[] = [
  {
    version: '0.10.0',
    date: '2026-03-30',
    title: l(
      'Smarter search, bulk actions, and under-the-hood improvements',
      'Inteligentniejsze wyszukiwanie, operacje zbiorcze i poprawki pod maską'
    ),
    description: l(
      'YouTube search now suggests queries as you type, playlists support drag-and-drop reordering, and multi-select lets you act on many tracks at once. Data fetching has been migrated to TanStack Query for snappier navigation.',
      'Wyszukiwanie na YouTube podpowiada frazy w trakcie pisania, playlisty obsługują zmianę kolejności przeciąganiem, a zaznaczanie wielu utworów pozwala na operacje zbiorcze. Pobieranie danych przeniesiono na TanStack Query dla płynniejszej nawigacji.'
    ),
    categories: [
      {
        label: l('Search', 'Wyszukiwanie'),
        entries: [
          l(
            'YouTube search autocomplete — suggestions appear as you type, powered by Google\'s suggest API routed through the main process.',
            'Autouzupełnianie wyszukiwania YouTube — podpowiedzi pojawiają się w trakcie pisania, korzystając z API podpowiedzi Google przez proces główny.'
          ),
          l(
            'Clear button (×) on the search input to quickly reset the query.',
            'Przycisk czyszczenia (×) w polu wyszukiwania do szybkiego resetowania zapytania.'
          ),
        ],
      },
      {
        label: l('Playlists', 'Playlisty'),
        entries: [
          l(
            'Drag-and-drop track reordering in playlists — grab a track and move it to any position.',
            'Zmiana kolejności utworów w playlistach przeciąganiem — chwyć utwór i przenieś na dowolną pozycję.'
          ),
        ],
      },
      {
        label: l('Library', 'Biblioteka'),
        entries: [
          l(
            'Multi-select tracks with bulk actions — select multiple tracks and perform actions like delete, add to playlist, or favorite in one step.',
            'Zaznaczanie wielu utworów z operacjami zbiorczymi — zaznacz wiele utworów i wykonuj akcje takie jak usuwanie, dodawanie do playlisty czy dodawanie do ulubionych jednym krokiem.'
          ),
        ],
      },
      {
        label: l('Performance', 'Wydajność'),
        entries: [
          l(
            'Migrated data fetching to TanStack Query across playlists, history, folders, lyrics, and library for faster navigation and smarter caching.',
            'Przeniesiono pobieranie danych na TanStack Query w playlistach, historii, folderach, tekstach piosenek i bibliotece dla szybszej nawigacji i lepszego cachowania.'
          ),
          l(
            'Extracted shared utilities and hooks to reduce code duplication across the app.',
            'Wyodrębniono współdzielone narzędzia i hooki, aby zmniejszyć duplikację kodu w aplikacji.'
          ),
        ],
      },
      {
        label: l('Bug fixes', 'Poprawki błędów'),
        entries: [
          l(
            'Fixed stuck loading spinner when restoring a paused track on app restart.',
            'Naprawiono zacięty spinner ładowania przy przywracaniu wstrzymanego utworu po restarcie aplikacji.'
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
      'Udostępniaj utwory i playlisty przez tymczasowe linki i kody QR. Cała aplikacja i strona główna obsługują teraz angielski i polski.'
    ),
    categories: [
      {
        label: l('Music sharing', 'Udostępnianie muzyki'),
        entries: [
          l(
            'Share any track or playlist via a time-limited link (1 hour) — right-click a track or use the share button on a playlist.',
            'Udostępnij dowolny utwór lub playlistę tymczasowym linkiem (1 godzina) — kliknij prawym przyciskiem na utwór lub użyj przycisku udostępniania na playliście.'
          ),
          l(
            'Share dialog with copyable link and scannable QR code for easy sharing on any device.',
            'Okno udostępniania z linkiem do skopiowania i kodem QR do zeskanowania na dowolnym urządzeniu.'
          ),
          l(
            'Web preview page at the share link shows track listing, artist info, and an "Open in Shiranami" button with deep link support.',
            'Strona podglądu pod linkiem pokazuje listę utworów, informacje o wykonawcy i przycisk „Otwórz w Shiranami" z obsługą deep linków.'
          ),
          l(
            'Import shared music directly into your library — downloads tracks from YouTube and creates a playlist with a custom name.',
            'Importuj udostępnioną muzykę bezpośrednio do biblioteki — pobiera utwory z YouTube i tworzy playlistę z własną nazwą.'
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
            'Pełne polskie tłumaczenie całej aplikacji — wszystkie napisy, podpowiedzi, powiadomienia, komunikaty błędów i puste stany.'
          ),
          l(
            'Language switcher in Settings — switch between English and Polish instantly.',
            'Przełącznik języka w Ustawieniach — natychmiastowe przełączanie między angielskim a polskim.'
          ),
          l(
            'Landing page available in both English and Polish with language toggle.',
            'Strona główna dostępna po angielsku i polsku z przełącznikiem języka.'
          ),
        ],
      },
      {
        label: l('Infrastructure', 'Infrastruktura'),
        entries: [
          l(
            'New share server (NestJS + PostgreSQL + Redis) with rate limiting, Redis caching, and automatic cleanup of expired shares.',
            'Nowy serwer udostępniania (NestJS + PostgreSQL + Redis) z limitowaniem żądań, cache Redis i automatycznym usuwaniem wygasłych linków.'
          ),
          l(
            'Docker-ready deployment with multi-stage Dockerfile and docker-compose for the share server.',
            'Gotowe do wdrożenia Dockerem z wieloetapowym Dockerfile i docker-compose dla serwera udostępniania.'
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
      'Skróty klawiszowe, szybkie ulubione i usprawnienia wyszukiwania'
    ),
    description: l(
      'Navigate and control playback entirely from the keyboard, favorite tracks directly from the player bar, and see view counts on search results.',
      'Steruj odtwarzaniem w całości z klawiatury, dodawaj utwory do ulubionych bezpośrednio z paska odtwarzacza i sprawdzaj liczbę wyświetleń w wynikach wyszukiwania.'
    ),
    categories: [
      {
        label: l('Keyboard shortcuts', 'Skróty klawiszowe'),
        entries: [
          l(
            'Full keyboard shortcut system — Space to play/pause, arrow keys for seeking and volume, M to mute, N/P for next/previous, S for shuffle, R for repeat, and more.',
            'Pełny system skrótów klawiszowych — spacja do odtwarzania i pauzy, strzałki do przewijania i sterowania głośnością, M do wyciszenia, N/P do następnego lub poprzedniego utworu, S do losowania, R do powtarzania i nie tylko.'
          ),
          l(
            'Press ? to open a help overlay listing all available shortcuts, organized by category.',
            'Naciśnij ?, aby otworzyć nakładkę pomocy z listą wszystkich dostępnych skrótów podzielonych na kategorie.'
          ),
          l(
            'Number keys 1–7 for quick navigation between views (Library, Playlists, Favorites, History, Download, Radio, Settings).',
            'Klawisze 1–7 pozwalają szybko przełączać widoki: Bibliotekę, Playlisty, Ulubione, Historię, Pobieranie, Radio i Ustawienia.'
          ),
          l(
            'Modifier shortcuts for panels: Ctrl+B (sidebar), Ctrl+L (lyrics), Ctrl+Q (queue), Ctrl+Shift+M (compact mode), V (visualizer).',
            'Skróty z modyfikatorem dla paneli: Ctrl+B (panel boczny), Ctrl+L (tekst), Ctrl+Q (kolejka), Ctrl+Shift+M (tryb kompaktowy), V (wizualizator).'
          ),
          l(
            'Platform-aware labels — shortcuts display ⌘ on macOS and Ctrl on Windows/Linux.',
            'Oznaczenia skrótów są zależne od platformy — na macOS wyświetlane jest ⌘, a na Windowsie i Linuksie Ctrl.'
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
            'Obok informacji o utworze na pasku odtwarzacza pojawił się nowy przycisk ulubionych — możesz szybko dodać serduszko albo je usunąć bez opuszczania bieżącego widoku.'
          ),
          l(
            'Fixed playlist detail view not reflecting favorite changes in real-time when toggled from the player bar or keyboard shortcut.',
            'Naprawiono widok szczegółów playlisty, który nie odświeżał zmian ulubionych w czasie rzeczywistym po przełączeniu ich z paska odtwarzacza albo skrótu klawiszowego.'
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
    title: l('Crossfade audio fix', 'Poprawka crossfade’u'),
    description: l(
      'Fixes a critical bug where enabling crossfade caused permanent audio loss after the first track transition.',
      'Naprawia krytyczny błąd, przez który włączenie crossfade’u powodowało trwały zanik dźwięku po pierwszym przejściu między utworami.'
    ),
    categories: [
      {
        label: l('Bug fixes', 'Poprawki błędów'),
        entries: [
          l(
            "Fixed permanent audio loss when crossfade is enabled — the idle deck's volume was zeroed before the Web Audio graph captured it, silencing all subsequent playback until restart.",
            'Naprawiono trwały zanik dźwięku przy włączonym crossfade’zie — głośność nieaktywnego decka była zerowana, zanim graf Web Audio zdążył ją przechwycić, przez co całe dalsze odtwarzanie milczało aż do restartu.'
          ),
          l(
            'Fixed a race condition where cached audio could fire canplay before the crossfade state was set, preventing the incoming deck from starting.',
            'Naprawiono warunek wyścigu, w którym zbuforowane audio mogło wywołać `canplay`, zanim ustawiony został stan crossfade’u, przez co wchodzący deck nie startował.'
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
      'Crossfade, wyłącznik czasowy i poprawki jakości życia'
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
            'Oba decki przechodzą przez `GainNode` w Web Audio, co pozwala na płynne zmiany głośności i wspólne wyjście do wizualizatora podczas przejść.'
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
            'Paczka głównego procesu desktopowego została zmniejszona z 2,0 MB do 568 KB dzięki wyniesieniu zależności npm poza bundel na etapie budowania.'
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
      'Znajdź dowolny utwór w kilka sekund dzięki nowemu filtrowi w bibliotece i globalnej palecie poleceń, którą otworzysz z każdego miejsca.'
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
            'Naprawiono `TypeError` przy hot-module reloadzie, spowodowany tym, że Vite 7 traktuje `import.meta.hot.data` jako tylko do odczytu.'
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
      'Trzymaj Shiranami zawsze pod ręką dzięki dedykowanemu kompaktowemu odtwarzaczowi, a potem wracaj do swoich nawyków słuchania w nowym widoku historii i statystyk.'
    ),
    categories: [
      {
        label: l('Compact mode', 'Tryb kompaktowy'),
        entries: [
          l(
            'Switch the main window into a dedicated compact player layout with art, transport controls, volume, and a tighter scrub bar.',
            'Główne okno można teraz przełączyć w dedykowany kompaktowy odtwarzacz z okładką, kontrolkami transportu, głośnością i ciaśniejszym paskiem przewijania.'
          ),
          l(
            'Compact mode restores your previous window bounds when you exit and includes an always-on-top toggle for desk-side playback.',
            'Tryb kompaktowy przywraca poprzedni rozmiar i pozycję okna po wyjściu oraz zawiera przełącznik zawsze na wierzchu do wygodnego odtwarzania obok biurka.'
          ),
          l(
            'The compact layout received multiple spacing and truncation passes so controls stay readable without overflowing the card.',
            'Układ kompaktowy dostał kilka poprawek odstępów i przycinania tekstu, dzięki czemu kontrolki pozostają czytelne bez wychodzenia poza kartę.'
          ),
        ],
      },
      {
        label: l('History and stats', 'Historia i statystyki'),
        entries: [
          l(
            'A new History view shows recent plays, top tracks, top artists, and key listening totals.',
            'Nowy widok Historii pokazuje ostatnie odsłuchania, najczęściej słuchane utwory, najpopularniejszych artystów i najważniejsze podsumowania słuchania.'
          ),
          l(
            'Stats support 7-day, 30-day, and all-time ranges, plus a daily activity graph for quick trends.',
            'Statystyki obsługują zakres 7 dni, 30 dni i cały okres, a do tego wykres dziennej aktywności dla szybkiego wychwytywania trendów.'
          ),
          l(
            'Listening history is recorded from meaningful sessions instead of every skip, producing cleaner stats.',
            'Historia słuchania jest zapisywana na podstawie wartościowych sesji zamiast każdego pominięcia, co daje czystsze statystyki.'
          ),
        ],
      },
      {
        label: l('Quality', 'Jakość'),
        entries: [
          l(
            'Added a shared Vitest workspace with initial coverage for web UI, desktop IPC, shared utilities, and database logic.',
            'Dodano wspólny workspace Vitest z początkowym pokryciem dla webowego UI, desktopowego IPC, współdzielonych narzędzi i logiki bazy danych.'
          ),
          l(
            'Release safety improved with automated checks around compact mode state, radio loading UI, seek bar behavior, and listening-history queries.',
            'Bezpieczeństwo wydań poprawiono dzięki automatycznym kontrolom stanu trybu kompaktowego, UI ładowania radia, zachowania paska przewijania i zapytań historii słuchania.'
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
      'Mała poprawka skupiona na płynniejszym przewijaniu, bardziej uporządkowanych kontrolkach okna w Windowsie i szybszym przeglądaniu radia.'
    ),
    categories: [
      {
        label: l('Player', 'Odtwarzacz'),
        entries: [
          l(
            'The player seek thumb now snaps straight to the scrubbed position instead of visibly sliding from the old timestamp.',
            'Uchwyt paska przewijania od razu przeskakuje teraz do wybranej pozycji zamiast wyraźnie dosuwać się od poprzedniego czasu.'
          ),
        ],
      },
      {
        label: l('Radio', 'Radio'),
        entries: [
          l(
            'Switching between Top Stations, By Country, and Favorites now shows skeleton rows while results load.',
            'Przełączanie między Popularnymi stacjami, Według kraju i Ulubionymi pokazuje teraz wiersze szkieletowe podczas ładowania wyników.'
          ),
          l(
            'Fast tab and country changes no longer let stale radio requests overwrite the newest selection.',
            'Szybkie zmiany zakładek i krajów nie pozwalają już, by stare żądania radia nadpisywały najnowszy wybór.'
          ),
          l(
            'The country picker now uses the same shared select styling as the rest of the app instead of a native browser dropdown.',
            'Wybór kraju korzysta teraz z tego samego współdzielonego stylu selecta co reszta aplikacji zamiast natywnej listy przeglądarki.'
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
      'Importuj całe playlisty z YouTube lub Spotify, przejrzyj paczkę przed pobraniem i porządkuj pobrane pliki bezpieczniejszym sposobem usuwania.'
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
            'Opcja Usuń z dysku przenosi teraz utwory do kosza z poziomu menu kontekstowego.'
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
            'Tytuły na górnym pasku są teraz poprawne w widokach Import playlisty i Radio.'
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
      'Pokazuj na Discordzie, czego słuchasz, i korzystaj z płynniej działającego podmenu playlist.'
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
      'Odsłuchuj wyniki wyszukiwania przed pobraniem i szybko sprawdzaj, co zmieniło się, gdy pojawi się aktualizacja.'
    ),
    categories: [
      {
        label: l('Search', 'Wyszukiwanie'),
        entries: [
          l(
            'Preview audio directly from search results by clicking the thumbnail — no download required.',
            'Odsłuchuj audio bezpośrednio z wyników wyszukiwania po kliknięciu miniatury — bez konieczności pobierania.'
          ),
          l(
            'Playback streams through the existing radio protocol so previews work instantly with the player bar.',
            'Odtwarzanie strumieniuje przez istniejący protokół radia, dzięki czemu podglądy działają od razu z paskiem odtwarzacza.'
          ),
        ],
      },
      {
        label: l('Updates', 'Aktualizacje'),
        entries: [
          l(
            'A "View changelog" link now appears in Settings when an update is available, opening the Shiranami website changelog.',
            'W ustawieniach pojawia się teraz link „Zobacz historię zmian”, gdy dostępna jest aktualizacja, i otwiera changelog strony Shiranami.'
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
      'Słuchaj stacji radia internetowego, korzystaj z szybszego renderowania dzięki okładkom serwowanym przez protokół i z lżejszego buildu opartego na esbuild.'
    ),
    categories: [
      {
        label: l('Radio', 'Radio'),
        entries: [
          l(
            'Stream internet radio stations via the Radio Browser API with a dedicated Radio view.',
            'Słuchaj stacji radia internetowego przez API Radio Browser w dedykowanym widoku Radia.'
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
            'Ograniczono częstotliwość aktualizacji store’a odtwarzania, zmemoizowano komponenty i zwirtualizowano panel kolejki.'
          ),
          l(
            'Main process is bundled with esbuild; icon assets optimized from ~885 KB down to ~176 KB.',
            'Główny proces jest bundlowany przez esbuild, a zasoby ikon zoptymalizowano z około 885 KB do około 176 KB.'
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
            'Usunięto duplikację hooka odpowiedzialnego za kolorystykę ambient, aby zapobiec zbędnym renderom canvasa.'
          ),
          l(
            'Fixed CSP img-src to allow the new art protocol.',
            'Naprawiono regułę `img-src` w CSP, aby dopuścić nowy protokół okładek.'
          ),
          l(
            'Synced app version labels across settings, sidebar, and landing page.',
            'Zsynchronizowano oznaczenia wersji aplikacji między ustawieniami, paskiem bocznym i landing page’em.'
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
      'Solidna poprawka desktopowego doświadczenia — strona ustawień została całkowicie przeprojektowana, a wizualizator dźwięku ma teraz dwa style, które możesz dobrać do nastroju.'
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
            'Dodano nowy wielokrotnego użytku komponent `Switch` z animacją sprężynową.'
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
      'Pierwsze wydanie skupia się na tym, by Shiranami stało się stabilnym desktopowym schronieniem do lokalnego słuchania, playlist, zsynchronizowanych tekstów i pobierania jednym kliknięciem.'
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
            'Gdy brakuje narzędzi wyszukiwania, yt-dlp i ffmpeg instalują się razem w jednym prowadzonym przepływie.'
          ),
          l(
            'Download progress stays visible across view changes instead of resetting with navigation.',
            'Postęp pobierania pozostaje widoczny po zmianie widoków zamiast resetować się przy nawigacji.'
          ),
          l(
            'yt-dlp and ffmpeg update buttons now check upstream versions instead of blindly redownloading.',
            'Przyciski aktualizacji yt-dlp i ffmpeg sprawdzają teraz wersje upstream zamiast bezmyślnie pobierać wszystko od nowa.'
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
            'Spakietowane buildy dla Windowsa zawierają teraz poprawne zasoby ikon zasobnika.'
          ),
          l(
            'Release workflows build desktop artifacts from tags and upload them back to GitHub Releases.',
            'Workflow wydawniczy buduje artefakty desktopowe z tagów i wysyła je z powrotem do GitHub Releases.'
          ),
          l(
            'Workspace version bumping and CI-side version syncing now cover the landing page too.',
            'Podbijanie wersji w workspace i synchronizacja wersji po stronie CI obejmują teraz także landing page.'
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
