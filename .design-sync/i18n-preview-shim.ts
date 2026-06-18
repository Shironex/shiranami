// design-sync preview shim for @/lib/i18n.
// The real apps/web/src/lib/i18n.ts uses Vite's `import.meta.glob` (lazy locales)
// at module scope; under the converter's IIFE bundle esbuild lowers import.meta
// to {}, so `import.meta.glob(...)` throws AT BUNDLE LOAD and leaves
// window.ShiranamiWeb undefined -> every preview fails. The sync tsconfig
// (apps/web/tsconfig.dssync.json) redirects @/lib/i18n here. Previews are
// English-only, so eager English resources fully suffice; Polish lazy-loading
// (the only thing the glob did) is intentionally dropped.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from '../apps/web/src/locales/en/common.json';
import sidebarEn from '../apps/web/src/locales/en/sidebar.json';
import topbarEn from '../apps/web/src/locales/en/topbar.json';
import playerEn from '../apps/web/src/locales/en/player.json';
import libraryEn from '../apps/web/src/locales/en/library.json';
import favoritesEn from '../apps/web/src/locales/en/favorites.json';
import playlistsEn from '../apps/web/src/locales/en/playlists.json';
import searchEn from '../apps/web/src/locales/en/search.json';
import radioEn from '../apps/web/src/locales/en/radio.json';
import historyEn from '../apps/web/src/locales/en/history.json';
import overviewEn from '../apps/web/src/locales/en/overview.json';
import settingsEn from '../apps/web/src/locales/en/settings.json';
import queueEn from '../apps/web/src/locales/en/queue.json';
import lyricsEn from '../apps/web/src/locales/en/lyrics.json';
import compactEn from '../apps/web/src/locales/en/compact.json';
import commandPaletteEn from '../apps/web/src/locales/en/commandPalette.json';
import shortcutsEn from '../apps/web/src/locales/en/shortcuts.json';
import sleepTimerEn from '../apps/web/src/locales/en/sleepTimer.json';
import contextMenuEn from '../apps/web/src/locales/en/contextMenu.json';
import toastEn from '../apps/web/src/locales/en/toast.json';
import splashEn from '../apps/web/src/locales/en/splash.json';
import importEn from '../apps/web/src/locales/en/import.json';
import shareEn from '../apps/web/src/locales/en/share.json';
import mixesEn from '../apps/web/src/locales/en/mixes.json';
import nowPlayingEn from '../apps/web/src/locales/en/nowPlaying.json';
import errorBoundaryEn from '../apps/web/src/locales/en/errorBoundary.json';
import equalizerEn from '../apps/web/src/locales/en/equalizer.json';
import enrichDialogEn from '../apps/web/src/locales/en/enrichDialog.json';
import editTagsEn from '../apps/web/src/locales/en/editTags.json';
import onboardingEn from '../apps/web/src/locales/en/onboarding.json';
import recommendationsEn from '../apps/web/src/locales/en/recommendations.json';
import smartPlaylistsEn from '../apps/web/src/locales/en/smartPlaylists.json';
import downloadsEn from '../apps/web/src/locales/en/downloads.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some(lang => lang.code === value);
}

const namespaces = [
  'common',
  'sidebar',
  'topbar',
  'player',
  'library',
  'favorites',
  'playlists',
  'search',
  'radio',
  'history',
  'overview',
  'settings',
  'queue',
  'lyrics',
  'compact',
  'commandPalette',
  'shortcuts',
  'sleepTimer',
  'contextMenu',
  'toast',
  'splash',
  'import',
  'share',
  'mixes',
  'nowPlaying',
  'errorBoundary',
  'equalizer',
  'enrichDialog',
  'editTags',
  'onboarding',
  'recommendations',
  'smartPlaylists',
  'downloads',
];

const englishResources = {
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
  overview: overviewEn,
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
  errorBoundary: errorBoundaryEn,
  equalizer: equalizerEn,
  enrichDialog: enrichDialogEn,
  editTags: editTagsEn,
  onboarding: onboardingEn,
  recommendations: recommendationsEn,
  smartPlaylists: smartPlaylistsEn,
  downloads: downloadsEn,
};

// Initialize eagerly at module scope so useTranslation resolves from first paint.
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    ns: namespaces,
    defaultNS: 'common',
    resources: { en: englishResources },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export function persistLanguage(_lang: SupportedLanguage) {}
export function initI18n(): Promise<unknown> {
  return Promise.resolve();
}
export async function hydrateLanguageFromStore(): Promise<void> {}

export default i18n;
