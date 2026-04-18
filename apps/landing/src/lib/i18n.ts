export const LANDING_LANGUAGES = ['en', 'pl'] as const;
export type LandingLanguage = (typeof LANDING_LANGUAGES)[number];

export const translations: Record<LandingLanguage, Record<string, string>> = {
  en: {
    // Shared
    'layout.skipToContent': 'Skip to content',

    // Navbar
    'nav.primary': 'Primary navigation',
    'nav.features': 'Features',
    'nav.preview': 'The app',
    'nav.philosophy': 'Philosophy',
    'nav.changelog': 'Changelog',
    'nav.download': 'Download',
    'nav.home': 'Home',
    'nav.getTheApp': 'Get the app',
    'nav.toggleMenu': 'Toggle menu',
    'nav.switchLanguage': 'Switch language',

    // Hero
    'hero.eyebrow': 'Vol. I  ·  A desktop player · Local-first',
    'hero.headline.lead': 'A quieter place to listen, far from',
    'hero.headline.tail': 'the algorithm.',
    'hero.sub':
      'Shiranami is the quiet desktop room where your own files, internet radio, synced lyrics and YouTube imports finally share a single shelf — no streaming account, no rented music, no recommendations whispered over your shoulder.',
    'hero.ctaPrimary': 'Download · Free',
    'hero.ctaSecondary': 'See the room',
    'hero.mascotAlt': 'Shiranami mascot — purple-haired listener with headphones',
    'hero.stat1': 'Source-available',
    'hero.stat2': 'Win · macOS',
    'hero.stat3': 'Quiet features',
    'hero.np.status': 'Now playing · 03:14 a.m.',
    'hero.np.aria': 'Now playing preview',

    // Features
    'features.headingLead': 'A whole listening room,',
    'features.headingAccent': 'folded',
    'features.headingTail': 'into one window.',
    'features.metaHeading': "What's inside",
    'features.metaSub': '19 quiet features',

    'features.library.titleLead': 'Your folders are the',
    'features.library.titleAccent': 'catalog',
    'features.library.body':
      'Point Shiranami at a folder. It scans your files, reads the tags, lifts the cover art, and quietly hands you back a real library — no upload, no account, no maybe-it-syncs.',
    'features.library.stat1': 'Plays · all time',
    'features.library.stat2': 'Listening',
    'features.library.stat3': 'Unique tracks',
    'features.library.stat4': 'Finished 95%+',

    'features.lyrics.titleLead': 'Lyrics that',
    'features.lyrics.titleAccent': 'scroll with you',
    'features.lyrics.body':
      'Time-synced lines glide past as the song plays. Click any line to seek there. The room dims; the words stay legible.',

    'features.radio.titleLead': 'A radio dial, still',
    'features.radio.titleAccent': 'warm',
    'features.radio.body':
      'Browse, stream and favorite stations from Radio Browser. Soul out of Paris, lo-fi out of Tokyo, talk out of nowhere in particular.',

    'features.crossfade.titleLead': 'Tracks',
    'features.crossfade.titleAccent': 'melt',
    'features.crossfade.titleTail': ', never bump.',
    'features.crossfade.body':
      'Dual-deck engine with equal-power crossfade. Set it from one second to twelve and let songs hand the room over to each other.',

    'features.import.titleLead': 'Pull a playlist',
    'features.import.titleAccent': 'down',
    'features.import.body':
      'Paste a YouTube or Spotify playlist URL. Shiranami pulls the whole list into a review queue, then downloads the ones you keep.',

    'features.ambient.titleLead': 'The room takes the',
    'features.ambient.titleAccent': 'color',
    'features.ambient.titleTail': 'of the song.',
    'features.ambient.body':
      'Shiranami sips the dominant color out of the cover art and washes it across the entire interface. The app dresses for the music, not the other way around.',
    'features.ambient.hint': 'Extracted from album art · tints the entire UI',

    'features.quiet.title': 'Sleep timer, mini player, command palette.',
    'features.quiet.body':
      'A quiet auto-pause when you fade out. A compact always-on-top window for when the screen is busy. Ctrl+K to vault anywhere in the library without touching the mouse.',

    // App preview
    'preview.headingLead': 'The app,',
    'preview.headingAccent': 'shown',
    'preview.headingTail': 'at three a.m.',
    'preview.metaHeading': 'The room',
    'preview.metaSub': 'Dark lavender · always',
    'preview.tagNow': 'Now playing — Kuusou Mesorogiwi · LeeandLie',
    'preview.tagCount': '12 tracks · 41:56',
    'preview.alt': 'Shiranami app — library view',

    // Philosophy
    'philosophy.definition': 'shi·ra·na·mi · n.\nwhite waves on dark water',
    'philosophy.quote.dropcap': 'M',
    'philosophy.quote.lead': 'ost music apps want to',
    'philosophy.quote.accent1': 'introduce',
    'philosophy.quote.mid': 'you to something. Shiranami just wants to',
    'philosophy.quote.accent2': 'get out of the way',
    'philosophy.quote.tail':
      '. It will keep your library, run your radio, hand you the lyrics, and resume the song you abandoned at 2:47 a.m. last Tuesday — exactly where you left it.',
    'philosophy.byline.one': 'One desktop window',
    'philosophy.byline.two': 'One quiet theme',
    'philosophy.byline.three': 'No catalog, no algorithm',

    // Suite
    'suite.headingLead': 'One app today.',
    'suite.headingAccent': 'A small family',
    'suite.headingTail': 'tomorrow.',
    'suite.metaHeading': 'The suite',
    'suite.metaSub': 'Locally connected',
    'suite.shiranami.role': 'Music sanctuary · you are here',
    'suite.shiranami.desc':
      'The desktop sanctuary for your local music library, synced lyrics, radio, and quiet downloads.',
    'suite.shiroani.role': 'Anime tracker',
    'suite.shiroani.desc':
      'A calm log for the shows you are watching, the ones you dropped, and the ones quietly waiting.',
    'suite.kireimanga.role': 'Manga reader',
    'suite.kireimanga.desc':
      'A quiet reader for chapters and tracked series — same dark lavender mood, different shelf.',

    // Download CTA
    'download.eyebrow': 'Take it home',
    'download.headingLead': 'Quiet, free, and',
    'download.headingAccent': 'yours',
    'download.body':
      'Free to download. Source-available. Updates land in-app on Windows; macOS users grab them from GitHub Releases.',
    'download.metaSize': '~84 MB',
    'download.metaStack': 'Electron 40',
    'download.action': 'Download',
    'download.windowsTag': '.exe · in-app updates',
    'download.macosTag': '.dmg · GitHub Releases',

    // Footer
    'footer.blurb':
      '“A calm desktop player for your local music library, synced lyrics, and a slow dial across the radio.”',
    'footer.col.app': 'The app',
    'footer.col.source': 'Source',
    'footer.link.download': 'Download',
    'footer.link.changelog': 'Changelog',
    'footer.link.features': 'Features',
    'footer.link.preview': 'The app',
    'footer.link.license': 'License',
    'footer.link.issues': 'Issues',
    'footer.link.discussions': 'Discussions',
    'footer.copyright': '© 2026 · Shironex · Source-available',
    'footer.byline': 'Made at 03:14 a.m. — somewhere quiet',

    // Download page (/download)
    'download.windows': 'Windows',
    'download.macos': 'macOS',
    'download.releasePage': 'Release page',
    'download.latestPublicBuild': 'Latest public build',
    'download.headingAfterLead': 'Download',
    'download.headingAfterAccent': 'started',
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

    // Changelog page — masthead
    'changelog.mh.issue': 'Issue',
    'changelog.mh.volume': 'Volume',
    'changelog.mh.volumeOne': 'One',
    'changelog.mh.releases': 'Releases',
    'changelog.mh.printed': 'Printed',
    'changelog.mh.edition': 'Edition',
    'changelog.mh.banner': '━━━━━━━  The Shiranami Record  ━━━━━━━',
    'changelog.mh.headingLead': 'A log of',
    'changelog.mh.headingAccent': 'small, quiet',
    'changelog.mh.headingTail': 'changes.',
    'changelog.mh.sub':
      'Every release since Shiranami opened its door — bug fixes at 3am, crossfade engines that actually work, ambient colors poured in by hand. Read it as a diary, or search the bits you need.',
    'changelog.mh.latest': 'Latest',
    'changelog.mh.released': 'Released',
    'changelog.mh.firstShip': 'First ship',
    'changelog.mh.platform': 'Platform',
    'changelog.mh.license': 'License',
    'changelog.mh.licenseValue': 'Source-avail.',
    'changelog.mh.rule': 'Changelog · Section 01 · Archive',

    // Changelog page — filters
    'changelog.filter.all': 'All releases',
    'changelog.filter.feature': 'New features',
    'changelog.filter.fix': 'Fixes',
    'changelog.filter.perf': 'Performance',
    'changelog.filter.polish': 'Polish',
    'changelog.search.placeholder': 'Search the archive — crossfade, radio, lyrics…',

    // Changelog page — releases
    'changelog.entry': 'Entry',
    'changelog.entryNumber': 'Entry №',
    'changelog.items.one': 'item',
    'changelog.items.many': 'items',
    'changelog.empty': 'Nothing in the archive matches that.',
    'changelog.empty.hint': 'Try a different word, or clear the filter.',
    'changelog.latest': '● Latest',
    'changelog.row.version': 'Version',
    'changelog.row.kind': 'Kind',
    'changelog.row.entries': 'Entries',
    'changelog.row.sections': 'Sections',
    'changelog.kind.feature': 'Feature release',
    'changelog.kind.fix': 'Bug fixes',
    'changelog.kind.perf': 'Performance',
    'changelog.kind.polish': 'Polish & tweaks',
    'changelog.jump.title': '● All releases · jump to an entry',
    'changelog.stamp': '● End of archive · 白波 · 2026',
    'changelog.quietNote': 'The first quiet note. More pages, soon.',
  },
  pl: {
    // Shared
    'layout.skipToContent': 'Przejdź do treści',

    // Navbar
    'nav.primary': 'Nawigacja główna',
    'nav.features': 'Funkcje',
    'nav.preview': 'Aplikacja',
    'nav.philosophy': 'Filozofia',
    'nav.changelog': 'Historia zmian',
    'nav.download': 'Pobierz',
    'nav.home': 'Strona główna',
    'nav.getTheApp': 'Pobierz aplikację',
    'nav.toggleMenu': 'Przełącz menu',
    'nav.switchLanguage': 'Zmień język',

    // Hero
    'hero.eyebrow': 'Vol. I  ·  Odtwarzacz desktopowy · Lokalnie',
    'hero.headline.lead': 'Spokojniejsze miejsce do słuchania, z dala od',
    'hero.headline.tail': 'algorytmów.',
    'hero.sub':
      'Shiranami to cichy pokój na pulpicie, w którym Twoje pliki, radio internetowe, zsynchronizowane teksty i importy z YouTube trafiają wreszcie na wspólną półkę — bez konta streamingowego, bez wynajmowanej muzyki, bez szeptów o poleceniach za Twoimi plecami.',
    'hero.ctaPrimary': 'Pobierz · za darmo',
    'hero.ctaSecondary': 'Zajrzyj do środka',
    'hero.mascotAlt': 'Maskotka Shiranami — słuchaczka z fioletowymi włosami i słuchawkami',
    'hero.stat1': 'Kod dostępny',
    'hero.stat2': 'Windows · macOS',
    'hero.stat3': 'Ciche funkcje',
    'hero.np.status': 'Teraz gra · 03:14 w nocy',
    'hero.np.aria': 'Podgląd — teraz gra',

    // Features
    'features.headingLead': 'Cały pokój do słuchania,',
    'features.headingAccent': 'złożony',
    'features.headingTail': 'w jedno okno.',
    'features.metaHeading': 'Co w środku',
    'features.metaSub': '19 cichych funkcji',

    'features.library.titleLead': 'Twoje foldery są',
    'features.library.titleAccent': 'katalogiem',
    'features.library.body':
      'Wskaż Shiranami folder. Aplikacja przeskanuje pliki, odczyta tagi, podniesie okładki i po cichu odda Ci prawdziwą bibliotekę — bez przesyłania, bez konta, bez „może się zsynchronizuje”.',
    'features.library.stat1': 'Odtworzenia · łącznie',
    'features.library.stat2': 'Czas słuchania',
    'features.library.stat3': 'Unikalne utwory',
    'features.library.stat4': 'Ukończone 95%+',

    'features.lyrics.titleLead': 'Teksty, które',
    'features.lyrics.titleAccent': 'przewijają się z Tobą',
    'features.lyrics.body':
      'Zsynchronizowane linijki przesuwają się razem z utworem. Kliknij dowolny wers, żeby tam przeskoczyć. Pokój przygasa; słowa zostają czytelne.',

    'features.radio.titleLead': 'Pokrętło radia, wciąż',
    'features.radio.titleAccent': 'ciepłe',
    'features.radio.body':
      'Przeglądaj, odtwarzaj i zapisuj stacje z Radio Browser. Soul z Paryża, lo-fi z Tokio, rozmowy znikąd w szczególności.',

    'features.crossfade.titleLead': 'Utwory',
    'features.crossfade.titleAccent': 'topnieją',
    'features.crossfade.titleTail': ', nigdy się nie zderzają.',
    'features.crossfade.body':
      'Dwudeckowy silnik z crossfade’em o równej mocy. Ustaw od sekundy do dwunastu i pozwól utworom przekazywać sobie pokój.',

    'features.import.titleLead': 'Ściągnij całą',
    'features.import.titleAccent': 'playlistę',
    'features.import.body':
      'Wklej adres playlisty z YouTube lub Spotify. Shiranami wciąga całą listę do kolejki do przejrzenia, a potem pobiera te, które zachowasz.',

    'features.ambient.titleLead': 'Pokój przyjmuje',
    'features.ambient.titleAccent': 'kolor',
    'features.ambient.titleTail': 'utworu.',
    'features.ambient.body':
      'Shiranami dobiera dominujący kolor z okładki albumu i rozciąga go na cały interfejs. To aplikacja ubiera się pod muzykę, nie odwrotnie.',
    'features.ambient.hint': 'Wyciągane z okładki · barwi cały interfejs',

    'features.quiet.title': 'Wyłącznik czasowy, mini odtwarzacz, paleta poleceń.',
    'features.quiet.body':
      'Ciche automatyczne wstrzymanie, gdy zasypiasz. Kompaktowe okno „zawsze na wierzchu”, gdy ekran jest zajęty. Ctrl+K, żeby przeskoczyć w dowolne miejsce w bibliotece bez dotykania myszy.',

    // App preview
    'preview.headingLead': 'Aplikacja,',
    'preview.headingAccent': 'pokazana',
    'preview.headingTail': 'o trzeciej w nocy.',
    'preview.metaHeading': 'Pokój',
    'preview.metaSub': 'Ciemny lawendowy · zawsze',
    'preview.tagNow': 'Teraz gra — Kuusou Mesorogiwi · LeeandLie',
    'preview.tagCount': '12 utworów · 41:56',
    'preview.alt': 'Shiranami — widok biblioteki',

    // Philosophy
    'philosophy.definition': 'shi·ra·na·mi · rzecz.\nbiałe fale na ciemnej wodzie',
    'philosophy.quote.dropcap': 'W',
    'philosophy.quote.lead': 'iększość aplikacji muzycznych chce Ci coś',
    'philosophy.quote.accent1': 'przedstawić',
    'philosophy.quote.mid': '. Shiranami chce tylko',
    'philosophy.quote.accent2': 'zejść Ci z drogi',
    'philosophy.quote.tail':
      '. Będzie pilnować Twojej biblioteki, puszczać radio, podawać teksty i wznawiać utwór, który porzuciłeś o 2:47 w nocy w zeszły wtorek — dokładnie w tym samym miejscu.',
    'philosophy.byline.one': 'Jedno okno na pulpicie',
    'philosophy.byline.two': 'Jeden spokojny motyw',
    'philosophy.byline.three': 'Bez katalogu, bez algorytmu',

    // Suite
    'suite.headingLead': 'Dziś jedna aplikacja.',
    'suite.headingAccent': 'Jutro mała rodzina.',
    'suite.headingTail': '',
    'suite.metaHeading': 'Pakiet',
    'suite.metaSub': 'Połączone lokalnie',
    'suite.shiranami.role': 'Przystań muzyki · jesteś tutaj',
    'suite.shiranami.desc':
      'Desktopowa przystań dla Twojej lokalnej biblioteki, zsynchronizowanych tekstów, radia i spokojnych pobrań.',
    'suite.shiroani.role': 'Śledzenie anime',
    'suite.shiroani.desc':
      'Spokojny dziennik dla seriali, które oglądasz, tych porzuconych i tych cierpliwie czekających na swoją kolej.',
    'suite.kireimanga.role': 'Czytnik mangi',
    'suite.kireimanga.desc':
      'Cichy czytnik rozdziałów i śledzonych serii — ten sam ciemny lawendowy klimat, inna półka.',

    // Download CTA
    'download.eyebrow': 'Weź ze sobą',
    'download.headingLead': 'Spokojnie, za darmo i',
    'download.headingAccent': 'po Twojemu',
    'download.body':
      'Darmowe pobranie. Kod dostępny. Aktualizacje trafiają do aplikacji na Windowsie; użytkownicy macOS pobierają je z GitHub Releases.',
    'download.metaSize': '~84 MB',
    'download.metaStack': 'Electron 40',
    'download.action': 'Pobierz',
    'download.windowsTag': '.exe · aktualizacje w aplikacji',
    'download.macosTag': '.dmg · GitHub Releases',

    // Footer
    'footer.blurb':
      '„Spokojny odtwarzacz na pulpit dla Twojej lokalnej biblioteki, zsynchronizowanych tekstów i powolnego przesuwania się po stacjach radiowych.”',
    'footer.col.app': 'Aplikacja',
    'footer.col.source': 'Kod',
    'footer.link.download': 'Pobierz',
    'footer.link.changelog': 'Historia zmian',
    'footer.link.features': 'Funkcje',
    'footer.link.preview': 'Aplikacja',
    'footer.link.license': 'Licencja',
    'footer.link.issues': 'Zgłoszenia',
    'footer.link.discussions': 'Dyskusje',
    'footer.copyright': '© 2026 · Shironex · Kod dostępny',
    'footer.byline': 'Zrobione o 03:14 nad ranem — gdzieś w ciszy',

    // Download page (/download)
    'download.windows': 'Windows',
    'download.macos': 'macOS',
    'download.releasePage': 'Strona wydania',
    'download.latestPublicBuild': 'Najnowsza publiczna wersja',
    'download.headingAfterLead': 'Pobieranie',
    'download.headingAfterAccent': 'ruszyło',
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

    // Changelog page — masthead
    'changelog.mh.issue': 'Numer',
    'changelog.mh.volume': 'Tom',
    'changelog.mh.volumeOne': 'Pierwszy',
    'changelog.mh.releases': 'Wydania',
    'changelog.mh.printed': 'Wydrukowano',
    'changelog.mh.edition': 'Edycja',
    'changelog.mh.banner': '━━━━━━━  Kronika Shiranami  ━━━━━━━',
    'changelog.mh.headingLead': 'Dziennik',
    'changelog.mh.headingAccent': 'cichych, drobnych',
    'changelog.mh.headingTail': 'zmian.',
    'changelog.mh.sub':
      'Każde wydanie od pierwszego dnia Shiranami — poprawki o 3 w nocy, crossfade, który naprawdę działa, kolory rozlewane ręcznie. Czytaj jak pamiętnik albo szukaj konkretnych fragmentów.',
    'changelog.mh.latest': 'Najnowsze',
    'changelog.mh.released': 'Wydano',
    'changelog.mh.firstShip': 'Pierwsze wydanie',
    'changelog.mh.platform': 'Platforma',
    'changelog.mh.license': 'Licencja',
    'changelog.mh.licenseValue': 'Kod dostępny',
    'changelog.mh.rule': 'Historia zmian · Sekcja 01 · Archiwum',

    // Changelog page — filters
    'changelog.filter.all': 'Wszystkie',
    'changelog.filter.feature': 'Nowe funkcje',
    'changelog.filter.fix': 'Poprawki',
    'changelog.filter.perf': 'Wydajność',
    'changelog.filter.polish': 'Szlif',
    'changelog.search.placeholder': 'Przeszukaj archiwum — crossfade, radio, teksty…',

    // Changelog page — releases
    'changelog.entry': 'Wpis',
    'changelog.entryNumber': 'Wpis №',
    'changelog.items.one': 'pozycja',
    'changelog.items.many': 'pozycji',
    'changelog.empty': 'Nic w archiwum nie pasuje do tego zapytania.',
    'changelog.empty.hint': 'Spróbuj innego słowa albo wyczyść filtr.',
    'changelog.latest': '● Najnowsze',
    'changelog.row.version': 'Wersja',
    'changelog.row.kind': 'Rodzaj',
    'changelog.row.entries': 'Pozycje',
    'changelog.row.sections': 'Sekcje',
    'changelog.kind.feature': 'Nowe funkcje',
    'changelog.kind.fix': 'Poprawki błędów',
    'changelog.kind.perf': 'Wydajność',
    'changelog.kind.polish': 'Szlif i drobiazgi',
    'changelog.jump.title': '● Wszystkie wydania · przejdź do wpisu',
    'changelog.stamp': '● Koniec archiwum · 白波 · 2026',
    'changelog.quietNote': 'Pierwsza cicha nuta. Więcej stron wkrótce.',
  },
};
