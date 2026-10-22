export const LANDING_LANGUAGES = ['en', 'pl'] as const;
export type LandingLanguage = (typeof LANDING_LANGUAGES)[number];

export const translations: Record<LandingLanguage, Record<string, string>> = {
  en: {
    // Shared
    'layout.skipToContent': 'Skip to content',

    // Navbar
    'nav.primary': 'Primary navigation',
    'nav.changelog': 'Changelog',
    'nav.download': 'Download',
    'nav.home': 'Home',
    'nav.getTheApp': 'Get the app',
    'nav.toggleMenu': 'Toggle menu',
    'nav.switchLanguage': 'Switch language',

    // Listening room (the homepage)
    'room.music': 'Background music',
    'room.stops': 'Stops in the room',

    // Hero
    'hero.ctaPrimary': 'Download · Free',
    'hero.ctaSecondary': 'See the room',
    'nav.switchLanguageToPl': 'Switch to Polish',
    'nav.switchLanguageToEn': 'Switch to English',

    // Download CTA
    'download.eyebrow': 'Take it home',
    'download.headingLead': 'Quiet, free, and',
    'download.headingAccent': 'yours',
    'download.body':
      'Free to download. Source-available. Updates land in-app on Windows; macOS users grab them from GitHub Releases.',
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

    // 404 page
    'notFound.pill': 'Error 404',
    'notFound.heading': 'This track skipped.',
    'notFound.body':
      'The page you were looking for has drifted off the shelf. Let’s get you back to a quieter room.',
    'notFound.home': 'Back home',
    'notFound.download': 'Download the app',
  },
  pl: {
    // Shared
    'layout.skipToContent': 'Przejdź do treści',

    // Navbar
    'nav.primary': 'Nawigacja główna',
    'nav.changelog': 'Historia zmian',
    'nav.download': 'Pobierz',
    'nav.home': 'Strona główna',
    'nav.getTheApp': 'Pobierz aplikację',
    'nav.toggleMenu': 'Przełącz menu',
    'nav.switchLanguage': 'Zmień język',

    // Listening room (the homepage)
    'room.music': 'Muzyka w tle',
    'room.stops': 'Przystanki w pokoju',

    // Hero
    'hero.ctaPrimary': 'Pobierz · za darmo',
    'hero.ctaSecondary': 'Zajrzyj do środka',
    'nav.switchLanguageToPl': 'Przełącz na polski',
    'nav.switchLanguageToEn': 'Przełącz na angielski',

    // Download CTA
    'download.eyebrow': 'Weź ze sobą',
    'download.headingLead': 'Spokojnie, za darmo i',
    'download.headingAccent': 'po Twojemu',
    'download.body':
      'Darmowe pobranie. Kod dostępny. Aktualizacje trafiają do aplikacji na Windowsie; użytkownicy macOS pobierają je z GitHub Releases.',
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

    // 404 page
    'notFound.pill': 'Błąd 404',
    'notFound.heading': 'Ten utwór przeskoczył.',
    'notFound.body':
      'Strona, której szukasz, zsunęła się z półki. Wróćmy do spokojniejszego pokoju.',
    'notFound.home': 'Powrót do strony głównej',
    'notFound.download': 'Pobierz aplikację',
  },
};
