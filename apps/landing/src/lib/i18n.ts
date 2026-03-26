export const LANDING_LANGUAGES = ['en', 'pl'] as const;
export type LandingLanguage = (typeof LANDING_LANGUAGES)[number];

export const translations: Record<LandingLanguage, Record<string, string>> = {
  en: {
    // Shared
    'layout.skipToContent': 'Skip to content',
    'brand.iconAlt': 'Shiranami icon',

    // Navbar
    'nav.primary': 'Primary navigation',
    'nav.features': 'Features',
    'nav.changelog': 'Changelog',
    'nav.download': 'Download',
    'nav.home': 'Home',
    'nav.getTheApp': 'Get the app',
    'nav.toggleMenu': 'Toggle menu',
    'nav.switchLanguage': 'Switch language',

    // Hero
    'hero.pill': 'Lofi desktop player',
    'hero.heading': 'A softer place for your music library.',
    'hero.body':
      'Shiranami keeps your local collection, playlists, synced lyrics, internet radio, crossfade, and new downloads in one calm desktop space, all in the same dark lavender mood.',
    'hero.ctaPrimary': 'Get the app',
    'hero.ctaSecondary': 'Release notes',
    'hero.platforms': 'Available for Windows and macOS',
    'hero.mascotAlt': 'Shiranami mascot',

    // Features
    'features.pill': 'What makes it feel like Shiranami',
    'features.heading': 'Everything is aimed at a calmer listening flow.',
    'features.subheading':
      'Less reloading, less setup repetition, and fewer panels fighting for attention while you listen.',
    'features.libraryFirst': 'Library first',
    'features.libraryFirstBody':
      'Built around your own folders and files, not around pushing you into an online catalog.',
    'features.searchDownload': 'Search & download',
    'features.searchDownloadBody':
      'Find tracks on YouTube, preview audio before downloading, and pull full YouTube or Spotify playlists in one go.',
    'features.crossfade': 'Crossfade & playback resume',
    'features.crossfadeBody':
      'Dual-deck engine with smooth equal-power crossfade. Volume, queue, and position all survive restarts.',
    'features.lyrics': 'Zsynchronizowane teksty',
    'features.lyricsBody':
      'Timestamped lyrics scroll with the music. Click any line to seek. Falls back to plain text when needed.',
    'features.radio': 'Internet radio',
    'features.radioBody':
      'Browse and stream stations from Radio Browser. Favorite the ones you like for quick access.',
    'features.sleepTimer': 'Sleep timer & compact mode',
    'features.sleepTimerBody':
      'Set a timer and let it auto-pause. Switch to a mini player with always-on-top when you want less screen.',
    'features.ambient': 'Ambient color & visualizer',
    'features.ambientBody':
      'The UI tints itself to the album art. A frequency bar or waveform strip plays above the player bar.',
    'features.quiet': 'Quiet interface touches',
    'features.quietBody':
      'Collapsible sidebar, command palette, listening history with stats, Discord Rich Presence, and adjustable UI scale.',

    // App preview
    'preview.pill': 'The app',
    'preview.heading': 'This is what it looks like.',
    'preview.body': 'Your library, now playing, and queue, all in one calm view.',
    'preview.alt': 'Shiranami desktop app showing the library view with a track playing',

    // Download CTA
    'cta.versionPill': 'is out',
    'cta.heading': 'Ready to listen?',
    'cta.body':
      'Grab the latest build for Windows or macOS, or read what went into making it feel right.',
    'cta.getTheApp': 'Get the app',
    'cta.releaseNotes': 'Release notes',

    // Footer
    'footer.tagline': 'Your personal music sanctuary.',
    'footer.githubAria': 'Shiranami on GitHub',

    // Download page
    'download.pill': 'Download',
    'download.heading': 'Pick the build that fits your desk.',
    'download.body':
      'We detect your platform and pull the latest build from GitHub so you can start listening.',
    'download.latestRelease': 'Latest release',
    'download.windows': 'Windows',
    'download.recommended': 'Recommended',
    'download.windowsDesc': 'NSIS installer build for the main supported desktop platform.',
    'download.downloadWindows': 'Download Windows build',
    'download.macos': 'macOS',
    'download.macosDesc': 'DMG build for manual installation from the latest release.',
    'download.downloadMacos': 'Download macOS build',
    'download.unsignedTitle': 'Unsigned build notes',
    'download.unsignedBody':
      'Windows may show SmartScreen. macOS requires a Terminal command after each download before the app will launch.',
    'download.releasePage': 'Release page',
    'download.latestPublicBuild': 'Latest public build',

    // Changelog page
    'changelog.label': 'Changelog',
    'changelog.heading': "What's new?",
    'changelog.subtitle': 'Release history and changes in Shiranami.',
  },
  pl: {
    // Shared
    'layout.skipToContent': 'Przejdź do treści',
    'brand.iconAlt': 'Ikona Shiranami',

    // Navbar
    'nav.primary': 'Nawigacja główna',
    'nav.features': 'Funkcje',
    'nav.changelog': 'Historia zmian',
    'nav.download': 'Pobierz',
    'nav.home': 'Strona główna',
    'nav.getTheApp': 'Pobierz aplikację',
    'nav.toggleMenu': 'Przełącz menu',
    'nav.switchLanguage': 'Zmień język',

    // Hero
    'hero.pill': 'Lo-fi odtwarzacz na komputer',
    'hero.heading': 'Spokojniejsze miejsce dla Twojej biblioteki muzycznej.',
    'hero.body':
      'Shiranami łączy lokalną kolekcję, playlisty, zsynchronizowane teksty, radio internetowe, crossfade i nowe pobrania w jednej spokojnej przestrzeni na pulpicie, utrzymanej w nocnym, lawendowym klimacie.',
    'hero.ctaPrimary': 'Pobierz aplikację',
    'hero.ctaSecondary': 'Zobacz zmiany',
    'hero.platforms': 'Dostępne na Windows i macOS',
    'hero.mascotAlt': 'Maskotka Shiranami',

    // Features
    'features.pill': 'Co sprawia, że to właśnie Shiranami',
    'features.heading': 'Wszystko zostało podporządkowane spokojniejszemu słuchaniu.',
    'features.subheading':
      'Mniej przeładowań, mniej powtarzania ustawień i mniej paneli walczących o uwagę, kiedy po prostu chcesz słuchać.',
    'features.libraryFirst': 'Biblioteka na pierwszym miejscu',
    'features.libraryFirstBody':
      'Całość opiera się na Twoich folderach i plikach, zamiast wciskać Ci katalog online.',
    'features.searchDownload': 'Wyszukiwanie i pobieranie',
    'features.searchDownloadBody':
      'Wyszukuj utwory na YouTube, odsłuchuj je przed pobraniem i pobieraj całe playlisty z YouTube lub Spotify za jednym razem.',
    'features.crossfade': 'Crossfade i wznawianie',
    'features.crossfadeBody':
      'Silnik z dwoma deckami i płynnym crossfade’em o równej mocy. Głośność, kolejka i pozycja odtwarzania przetrwają restart aplikacji.',
    'features.lyrics': 'Synced lyrics',
    'features.lyricsBody':
      'Tekst przewija się w rytm muzyki dzięki znacznikom czasu. Kliknij dowolny wers, żeby przeskoczyć do tego momentu. Gdy trzeba, aplikacja przełączy się na zwykły tekst.',
    'features.radio': 'Radio internetowe',
    'features.radioBody':
      'Przeglądaj i odtwarzaj stacje z Radio Browser. Ulubione zapiszesz pod ręką, żeby wracać do nich jednym kliknięciem.',
    'features.sleepTimer': 'Wyłącznik czasowy i tryb kompaktowy',
    'features.sleepTimerBody':
      'Ustaw wyłącznik czasowy, a odtwarzanie zatrzyma się samo. Gdy chcesz mniej ekranu, przełącz się na mini odtwarzacz z opcją zawsze na wierzchu.',
    'features.ambient': 'Kolorystyka i wizualizator',
    'features.ambientBody':
      'Interfejs dopasowuje akcenty kolorystyczne do okładki albumu. Nad paskiem odtwarzacza może działać wizualizator w formie słupków albo fali.',
    'features.quiet': 'Spokojne detale interfejsu',
    'features.quietBody':
      'Zwijany pasek boczny, paleta poleceń, historia słuchania ze statystykami, Discord Rich Presence i regulowana skala interfejsu.',

    // App preview
    'preview.pill': 'Aplikacja',
    'preview.heading': 'Tak to wygląda.',
    'preview.body': 'Biblioteka, aktualnie odtwarzany utwór i kolejka w jednym spokojnym widoku.',
    'preview.alt': 'Aplikacja Shiranami pokazująca widok biblioteki z odtwarzanym utworem',

    // Download CTA
    'cta.versionPill': 'już dostępna',
    'cta.heading': 'Gotowy do słuchania?',
    'cta.body':
      'Pobierz najnowszą wersję na Windows lub macOS albo sprawdź, co zmieniło się w kolejnych wydaniach.',
    'cta.getTheApp': 'Pobierz aplikację',
    'cta.releaseNotes': 'Zobacz zmiany',

    // Footer
    'footer.tagline': 'Twoje osobiste muzyczne schronienie.',
    'footer.githubAria': 'Shiranami na GitHubie',

    // Download page
    'download.pill': 'Pobierz',
    'download.heading': 'Wybierz wersję dla swojego systemu.',
    'download.body':
      'Wykrywamy Twoją platformę i podpinamy najnowsze wydanie z GitHuba, żebyś mógł od razu zacząć słuchać.',
    'download.latestRelease': 'Najnowsze wydanie',
    'download.windows': 'Windows',
    'download.recommended': 'Polecane',
    'download.windowsDesc': 'Instalator NSIS dla głównej wspieranej wersji aplikacji desktopowej.',
    'download.downloadWindows': 'Pobierz wersję dla Windows',
    'download.macos': 'macOS',
    'download.macosDesc': 'Obraz DMG do ręcznej instalacji z najnowszego wydania.',
    'download.downloadMacos': 'Pobierz wersję dla macOS',
    'download.unsignedTitle': 'Informacje o niepodpisanej wersji',
    'download.unsignedBody':
      'Windows może wyświetlić SmartScreen. Na macOS po każdym pobraniu trzeba wykonać jedno polecenie w Terminalu, zanim aplikacja się uruchomi.',
    'download.releasePage': 'Strona wydania',
    'download.latestPublicBuild': 'Najnowsza publiczna wersja',

    // Changelog page
    'changelog.label': 'Historia zmian',
    'changelog.heading': 'Co nowego?',
    'changelog.subtitle': 'Historia wydań i zmian w Shiranami.',
  },
};
