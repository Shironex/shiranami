import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';

import commonEn from '@/locales/en/common.json';
import sidebarEn from '@/locales/en/sidebar.json';
import topbarEn from '@/locales/en/topbar.json';
import playerEn from '@/locales/en/player.json';
import libraryEn from '@/locales/en/library.json';
import favoritesEn from '@/locales/en/favorites.json';
import playlistsEn from '@/locales/en/playlists.json';
import searchEn from '@/locales/en/search.json';
import radioEn from '@/locales/en/radio.json';
import historyEn from '@/locales/en/history.json';
import settingsEn from '@/locales/en/settings.json';
import queueEn from '@/locales/en/queue.json';
import lyricsEn from '@/locales/en/lyrics.json';
import compactEn from '@/locales/en/compact.json';
import commandPaletteEn from '@/locales/en/commandPalette.json';
import shortcutsEn from '@/locales/en/shortcuts.json';
import sleepTimerEn from '@/locales/en/sleepTimer.json';
import contextMenuEn from '@/locales/en/contextMenu.json';
import toastEn from '@/locales/en/toast.json';
import splashEn from '@/locales/en/splash.json';
import importEn from '@/locales/en/import.json';
import shareEn from '@/locales/en/share.json';
import mixesEn from '@/locales/en/mixes.json';
import nowPlayingEn from '@/locales/en/nowPlaying.json';

import commonPl from '@/locales/pl/common.json';
import sidebarPl from '@/locales/pl/sidebar.json';
import topbarPl from '@/locales/pl/topbar.json';
import playerPl from '@/locales/pl/player.json';
import libraryPl from '@/locales/pl/library.json';
import favoritesPl from '@/locales/pl/favorites.json';
import playlistsPl from '@/locales/pl/playlists.json';
import searchPl from '@/locales/pl/search.json';
import radioPl from '@/locales/pl/radio.json';
import historyPl from '@/locales/pl/history.json';
import settingsPl from '@/locales/pl/settings.json';
import queuePl from '@/locales/pl/queue.json';
import lyricsPl from '@/locales/pl/lyrics.json';
import compactPl from '@/locales/pl/compact.json';
import commandPalettePl from '@/locales/pl/commandPalette.json';
import shortcutsPl from '@/locales/pl/shortcuts.json';
import sleepTimerPl from '@/locales/pl/sleepTimer.json';
import contextMenuPl from '@/locales/pl/contextMenu.json';
import toastPl from '@/locales/pl/toast.json';
import splashPl from '@/locales/pl/splash.json';
import importPl from '@/locales/pl/import.json';
import sharePl from '@/locales/pl/share.json';
import mixesPl from '@/locales/pl/mixes.json';
import nowPlayingPl from '@/locales/pl/nowPlaying.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const LANGUAGE_STORAGE_KEY = 'shiranami.language';

function getInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'en' || stored === 'pl') return stored;
  return 'en';
}

export function persistLanguage(lang: SupportedLanguage) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);

  if (IS_ELECTRON) {
    window.electronAPI.store.set('app.language', lang).catch(() => {});
  }
}

const namespaces = [
  'common', 'sidebar', 'topbar', 'player', 'library', 'favorites',
  'playlists', 'search', 'radio', 'history', 'settings', 'queue',
  'lyrics', 'compact', 'commandPalette', 'shortcuts', 'sleepTimer',
  'contextMenu', 'toast', 'splash', 'import', 'share', 'mixes', 'nowPlaying',
] as const;

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: commonEn,
      sidebar: sidebarEn,
      topbar: topbarEn,
      player: playerEn,
      library: libraryEn,
      favorites: favoritesEn,
      playlists: playlistsEn,
      search: searchEn,
      radio: radioEn,
      history: historyEn,
      settings: settingsEn,
      queue: queueEn,
      lyrics: lyricsEn,
      compact: compactEn,
      commandPalette: commandPaletteEn,
      shortcuts: shortcutsEn,
      sleepTimer: sleepTimerEn,
      contextMenu: contextMenuEn,
      toast: toastEn,
      splash: splashEn,
      import: importEn,
      share: shareEn,
      mixes: mixesEn,
      nowPlaying: nowPlayingEn,
    },
    pl: {
      common: commonPl,
      sidebar: sidebarPl,
      topbar: topbarPl,
      player: playerPl,
      library: libraryPl,
      favorites: favoritesPl,
      playlists: playlistsPl,
      search: searchPl,
      radio: radioPl,
      history: historyPl,
      settings: settingsPl,
      queue: queuePl,
      lyrics: lyricsPl,
      compact: compactPl,
      commandPalette: commandPalettePl,
      shortcuts: shortcutsPl,
      sleepTimer: sleepTimerPl,
      contextMenu: contextMenuPl,
      toast: toastPl,
      splash: splashPl,
      import: importPl,
      share: sharePl,
      mixes: mixesPl,
      nowPlaying: nowPlayingPl,
    },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  ns: namespaces as unknown as string[],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
});

export async function hydrateLanguageFromStore() {
  if (!IS_ELECTRON) return;
  try {
    const stored = await window.electronAPI.store.get<string>('app.language');
    if (stored === 'en' || stored === 'pl') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, stored);
      if (i18n.language !== stored) {
        await i18n.changeLanguage(stored);
      }
    }
  } catch {
    // Ignore store read failures
  }
}

export default i18n;
