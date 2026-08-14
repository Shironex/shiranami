import i18n from 'i18next';
import type { BackendModule, ReadCallback, ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { logger } from '@/lib/logger';

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
import overviewEn from '@/locales/en/overview.json';
import settingsEn from '@/locales/en/settings.json';
import queueEn from '@/locales/en/queue.json';
import lyricsEn from '@/locales/en/lyrics.json';
import compactEn from '@/locales/en/compact.json';
import companionEn from '@/locales/en/companion.json';
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
import errorBoundaryEn from '@/locales/en/errorBoundary.json';
import equalizerEn from '@/locales/en/equalizer.json';
import enrichDialogEn from '@/locales/en/enrichDialog.json';
import editTagsEn from '@/locales/en/editTags.json';
import onboardingEn from '@/locales/en/onboarding.json';
import recommendationsEn from '@/locales/en/recommendations.json';
import smartPlaylistsEn from '@/locales/en/smartPlaylists.json';
import downloadsEn from '@/locales/en/downloads.json';
import sanctuaryEn from '@/locales/en/sanctuary.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pl', label: 'Polski' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some(lang => lang.code === value);
}

const LANGUAGE_STORAGE_KEY = 'shiranami.language';

function getInitialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(stored)) return stored;
  return 'en';
}

export function persistLanguage(lang: SupportedLanguage) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);

  if (IS_ELECTRON) {
    window.electronAPI.store
      .set('app.language', lang)
      .catch(err => logger.warn('Failed to persist language preference', err));
  }
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
  'companion',
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
  'sanctuary',
] as const;

// English is the fallback locale, so its 35 namespaces stay statically bundled
// into the entry chunk — every key must resolve synchronously even when another
// locale is active and missing a key. Every other locale is loaded on demand by
// the backend below so its namespaces never weigh down first paint.
const englishResources: ResourceLanguage = {
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
  companion: companionEn,
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
  sanctuary: sanctuaryEn,
};

// Per-namespace lazy importers for the non-English locales. English is excluded
// because it ships statically in `englishResources` above; pulling it into the
// glob would split the bundled fallback back out into eager chunks. Vite turns
// each matched JSON into its own dynamically-imported module, and Rollup groups
// a locale's namespaces into one chunk — switching to Polish pulls one `pl`
// chunk, not 33 round-trips.
const localeModules = import.meta.glob<{ default: ResourceLanguage[string] }>([
  '../locales/*/*.json',
  '!../locales/en/*.json',
]);

// Re-key the glob by `${locale}/${namespace}` so lookups don't depend on the
// path prefix Vite happens to emit for the matched keys.
type LocaleLoader = () => Promise<{ default: ResourceLanguage[string] }>;
const localeLoaders = new Map<string, LocaleLoader>();
for (const [path, loader] of Object.entries(localeModules)) {
  const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (match) localeLoaders.set(`${match[1]}/${match[2]}`, loader);
}

/**
 * On-demand resource backend. English is served from the eagerly-bundled
 * resources; any other locale's namespace is dynamically imported the first
 * time i18next asks for it (initial render in that language, or a switch).
 * Routing every locale through here means direct `i18n.changeLanguage(...)`
 * calls anywhere in the app — and in tests — transparently pull the chunk.
 */
const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init: () => {},
  read: (language: string, namespace: string, callback: ReadCallback) => {
    if (language === 'en') {
      callback(null, englishResources[namespace] ?? false);
      return;
    }
    const loader = localeLoaders.get(`${language}/${namespace}`);
    if (!loader) {
      callback(null, false);
      return;
    }
    loader()
      .then(mod => callback(null, mod.default))
      .catch(err => {
        logger.warn(`Failed to load locale ${language}/${namespace}`, err);
        // Signal a hard failure so i18next falls back to English for this key.
        callback(err instanceof Error ? err : new Error(String(err)), false);
      });
  },
};

/**
 * Boot i18next with English bundled and every other locale lazy. Awaiting the
 * returned promise guarantees the initial language's namespaces are present
 * before first paint, so a user whose persisted language is Polish never sees a
 * flash of raw English keys (main.tsx awaits this before rendering).
 */
export function initI18n(): Promise<unknown> {
  return i18n
    .use(lazyLocaleBackend)
    .use(initReactI18next)
    .init({
      // Only English ships eagerly; `partialBundledLanguages` lets the backend
      // supply the rest on demand even though `resources` is populated.
      resources: { en: englishResources },
      partialBundledLanguages: true,
      lng: getInitialLanguage(),
      fallbackLng: 'en',
      ns: namespaces as unknown as string[],
      defaultNS: 'common',
      interpolation: {
        escapeValue: false,
      },
    });
}

export async function hydrateLanguageFromStore() {
  if (!IS_ELECTRON) return;
  try {
    const stored = await window.electronAPI.store.get<string>('app.language');
    if (isSupportedLanguage(stored)) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, stored);
      if (i18n.language !== stored) {
        // changeLanguage awaits the backend, so the target locale's namespaces
        // are loaded before the UI re-renders in the new language.
        await i18n.changeLanguage(stored);
      }
    }
  } catch {
    // Ignore store read failures
  }
}

export default i18n;
