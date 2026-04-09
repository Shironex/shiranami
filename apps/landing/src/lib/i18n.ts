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
    'features.lyrics': 'Synced lyrics',
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
    'download.headingAfter': 'Download started!',
    'download.bodyAfter': 'Your build is on its way. See you in the app.',
    'download.yourSystem': 'Your system',
    'download.fetchFailed': 'Could not load the latest release.',
    'download.getFromGithub': 'Get it from GitHub',
    'download.changelog': 'Changelog',
    'download.githubRelease': 'GitHub release',
    'download.unsignedShortTitle': 'Unsigned build',
    'download.unsignedShortBody':
      'macOS requires a Terminal command after each download before the app will launch.',
    'download.mascotAlt': 'Shiranami mascot',
    'download.downloadStartedAnnouncement': 'Download started. See you in the app.',
    'download.downloadAria': 'Download Shiranami for {platform} ({ext}, {size})',

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
    'hero.heading': 'Spokojna przystań dla Twojej biblioteki muzycznej.',
    'hero.body':
      'Shiranami zbiera lokalną kolekcję, playlisty, zsynchronizowane teksty, radio internetowe, crossfade i nowe pobrania w jednym spokojnym miejscu na pulpicie, utrzymanym w nocnym, lawendowym klimacie.',
    'hero.ctaPrimary': 'Pobierz aplikację',
    'hero.ctaSecondary': 'Zobacz zmiany',
    'hero.platforms': 'Dostępne na Windowsie i macOS',
    'hero.mascotAlt': 'Maskotka Shiranami',

    // Features
    'features.pill': 'Co sprawia, że to właśnie Shiranami',
    'features.heading': 'Wszystko podporządkowaliśmy spokojniejszemu słuchaniu.',
    'features.subheading':
      'Mniej przeładowań, mniej powtarzania ustawień i mniej paneli, które odciągają uwagę od muzyki.',
    'features.libraryFirst': 'Biblioteka na pierwszym miejscu',
    'features.libraryFirstBody':
      'Shiranami opiera się na Twoich folderach i plikach, zamiast wypychać Cię do katalogu online.',
    'features.searchDownload': 'Wyszukiwanie i pobieranie',
    'features.searchDownloadBody':
      'Wyszukuj utwory na YouTube, odsłuchuj je przed pobraniem i ściągaj całe playlisty z YouTube lub Spotify za jednym zamachem.',
    'features.crossfade': 'Crossfade i wznawianie odtwarzania',
    'features.crossfadeBody':
      'Dwudeckowy silnik z płynnym crossfade’em o równej mocy. Głośność, kolejka i miejsce, w którym skończyłeś słuchać, przetrwają restart aplikacji.',
    'features.lyrics': 'Zsynchronizowane teksty',
    'features.lyricsBody':
      'Tekst przewija się razem z muzyką. Kliknij dowolny wers, aby przeskoczyć do tego momentu. W razie potrzeby aplikacja przełączy się na zwykły tekst.',
    'features.radio': 'Radio internetowe',
    'features.radioBody':
      'Przeglądaj i odtwarzaj stacje z Radio Browser. Te ulubione zapiszesz na później, żeby wracać do nich jednym kliknięciem.',
    'features.sleepTimer': 'Wyłącznik czasowy i tryb kompaktowy',
    'features.sleepTimerBody':
      'Ustaw wyłącznik czasowy i pozwól, by odtwarzanie zatrzymało się samo. Gdy chcesz mniej zajętego ekranu, przełącz się na mini odtwarzacz z opcją zawsze na wierzchu.',
    'features.ambient': 'Kolory z okładki i wizualizator',
    'features.ambientBody':
      'Interfejs dopasowuje akcenty do okładki albumu. Nad paskiem odtwarzacza może działać wizualizator w formie słupków albo fali.',
    'features.quiet': 'Spokojne detale interfejsu',
    'features.quietBody':
      'Zwijany pasek boczny, paleta poleceń, historia słuchania ze statystykami, Discord Rich Presence i regulowana skala interfejsu.',

    // App preview
    'preview.pill': 'Aplikacja',
    'preview.heading': 'Zobacz, jak to wygląda.',
    'preview.body': 'Biblioteka, aktualnie grany utwór i kolejka w jednym spokojnym widoku.',
    'preview.alt': 'Aplikacja Shiranami pokazująca widok biblioteki z odtwarzanym utworem',

    // Download CTA
    'cta.versionPill': 'już dostępna',
    'cta.heading': 'Gotowy do słuchania?',
    'cta.body':
      'Pobierz najnowszą wersję na Windows lub macOS albo sprawdź, co trafiło do ostatnich wydań.',
    'cta.getTheApp': 'Pobierz aplikację',
    'cta.releaseNotes': 'Zobacz zmiany',

    // Footer
    'footer.tagline': 'Twoja osobista przystań dla muzyki.',
    'footer.githubAria': 'Shiranami na GitHubie',

    // Download page
    'download.pill': 'Pobierz',
    'download.heading': 'Wybierz wydanie dla swojego systemu.',
    'download.body':
      'Wykrywamy Twoją platformę i kierujemy Cię do najnowszego wydania na GitHubie, żebyś mógł od razu zacząć słuchać.',
    'download.latestRelease': 'Najnowsze wydanie',
    'download.windows': 'Windows',
    'download.recommended': 'Polecane',
    'download.windowsDesc': 'Instalator NSIS dla głównej wspieranej platformy desktopowej.',
    'download.downloadWindows': 'Pobierz wersję dla Windows',
    'download.macos': 'macOS',
    'download.macosDesc': 'Obraz DMG do ręcznej instalacji z najnowszego wydania.',
    'download.downloadMacos': 'Pobierz wersję dla macOS',
    'download.unsignedTitle': 'Uwagi o niepodpisanej wersji',
    'download.unsignedBody':
      'Windows może pokazać SmartScreen. Na macOS po każdym pobraniu trzeba wykonać jedno polecenie w Terminalu, zanim aplikacja wystartuje.',
    'download.releasePage': 'Strona wydania',
    'download.latestPublicBuild': 'Najnowsza publiczna wersja',
    'download.headingAfter': 'Pobieranie rozpoczęte!',
    'download.bodyAfter': 'Twoja wersja jest już w drodze. Do zobaczenia w aplikacji.',
    'download.yourSystem': 'Twój system',
    'download.fetchFailed': 'Nie udało się pobrać informacji o najnowszym wydaniu.',
    'download.getFromGithub': 'Pobierz z GitHuba',
    'download.changelog': 'Historia zmian',
    'download.githubRelease': 'Wydanie na GitHubie',
    'download.unsignedShortTitle': 'Niepodpisana aplikacja',
    'download.unsignedShortBody':
      'macOS wymaga jednego polecenia w Terminalu po każdym pobraniu, zanim aplikacja wystartuje.',
    'download.mascotAlt': 'Maskotka Shiranami',
    'download.downloadStartedAnnouncement': 'Pobieranie rozpoczęte. Do zobaczenia w aplikacji.',
    'download.downloadAria': 'Pobierz Shiranami na {platform} ({ext}, {size})',

    // Changelog page
    'changelog.label': 'Historia zmian',
    'changelog.heading': 'Co nowego?',
    'changelog.subtitle': 'Historia wydań i zmian w Shiranami.',
  },
};
