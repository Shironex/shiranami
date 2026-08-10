import { useTranslation } from 'react-i18next';
import {
  usePreferSyncedFromLrclibQuery,
  useUpdatePreferSyncedFromLrclibMutation,
} from '@/hooks/queries/useLyrics';
import {
  saveFetchedLyricsPatch,
  useSaveFetchedLyricsQuery,
  useUpdateSaveFetchedLyricsMutation,
} from '@/hooks/queries/useLyricsSavePrefs';
import { useLyricsSave } from '@/hooks/useLyricsSave';
import { IS_ELECTRON } from '@/lib/platform';
import {
  useLyricsAppearanceStore,
  LYRICS_PLAIN_OPACITY_MIN,
  LYRICS_PLAIN_OPACITY_MAX,
  LYRICS_PLAIN_OPACITY_STEP,
  LYRICS_PLAIN_OPACITY_DEFAULT,
  LYRICS_PLAIN_FONT_SIZE_DEFAULT,
  LYRICS_SYNCED_DIM_OPACITY_MIN,
  LYRICS_SYNCED_DIM_OPACITY_MAX,
  LYRICS_SYNCED_DIM_OPACITY_STEP,
  LYRICS_SYNCED_DIM_OPACITY_DEFAULT,
  LYRICS_SYNCED_FONT_SIZE_DEFAULT,
  LYRICS_PRESENTATION_DEFAULT,
} from '@/stores/useLyricsAppearanceStore';
import { useUIStore } from '@/stores/useUIStore';
import type { LyricsBatchSummary } from '@shiranami/contracts';
import type { ILyricsSectionView } from './LyricsSection.types';

export function useLyricsSection(): ILyricsSectionView {
  const { t: tc } = useTranslation('common');

  // Persisted as an electron-store key (main reads it during lyric
  // resolution). Query-seeded + optimistic mutation with rollback, matching
  // the useSystemPrefs pattern for main-consumed settings.
  const { data: preferSynced } = usePreferSyncedFromLrclibQuery();
  const updatePreferSynced = useUpdatePreferSyncedFromLrclibMutation();

  // The write-back opt-in and the library run it gates. Same query-seeded
  // pattern; the run is a live backend batch rather than a stored value.
  const { data: saveFetched } = useSaveFetchedLyricsQuery();
  const updateSaveFetched = useUpdateSaveFetchedLyricsMutation();
  const lyricsSave = useLyricsSave();

  const lyricsPlainOpacity = useLyricsAppearanceStore(s => s.lyricsPlainOpacity);
  const lyricsPlainFontSize = useLyricsAppearanceStore(s => s.lyricsPlainFontSize);
  const setLyricsPlainOpacity = useLyricsAppearanceStore(s => s.setLyricsPlainOpacity);
  const setLyricsPlainFontSize = useLyricsAppearanceStore(s => s.setLyricsPlainFontSize);

  const lyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.lyricsSyncedDimOpacity);
  const lyricsSyncedFontSize = useLyricsAppearanceStore(s => s.lyricsSyncedFontSize);
  const setLyricsSyncedDimOpacity = useLyricsAppearanceStore(s => s.setLyricsSyncedDimOpacity);
  const setLyricsSyncedFontSize = useLyricsAppearanceStore(s => s.setLyricsSyncedFontSize);
  const lyricsPresentation = useLyricsAppearanceStore(s => s.lyricsPresentation);
  const setLyricsPresentation = useLyricsAppearanceStore(s => s.setLyricsPresentation);

  const resetLyricsAppearance = useLyricsAppearanceStore(s => s.resetLyricsAppearance);
  const nowPlayingViewEnabled = useUIStore(s => s.nowPlayingViewEnabled);

  const { t } = useTranslation('settings');

  const isModified =
    lyricsPlainOpacity !== LYRICS_PLAIN_OPACITY_DEFAULT ||
    lyricsPlainFontSize !== LYRICS_PLAIN_FONT_SIZE_DEFAULT ||
    lyricsSyncedDimOpacity !== LYRICS_SYNCED_DIM_OPACITY_DEFAULT ||
    lyricsSyncedFontSize !== LYRICS_SYNCED_FONT_SIZE_DEFAULT ||
    lyricsPresentation !== LYRICS_PRESENTATION_DEFAULT;

  return {
    t,
    resetLabel: tc('reset'),

    preferSyncedFromLrclib: preferSynced === true,
    // Inert until the persisted value has seeded (and outside Electron).
    preferSyncedDisabled: !IS_ELECTRON || preferSynced === undefined,
    onSetPreferSyncedFromLrclib: value => updatePreferSynced.mutate(value),

    // `=== true` rather than a truthiness check, deliberately: an unseeded
    // `undefined` must read as off. This is the one setting that lets the app
    // write into the user's music folders, and a switch that looked on while
    // the backend had not agreed would be a promise nobody made.
    saveFetchedLyrics: saveFetched === true,
    saveFetchedDisabled: !IS_ELECTRON || saveFetched === undefined,
    onSetSaveFetchedLyrics: value => updateSaveFetched.mutate(saveFetchedLyricsPatch(value)),

    saveRunning: lyricsSave.running,
    // The button follows the opt-in, matching the backend, which refuses the
    // channel outright with `lyrics.save_disabled` when the setting is off. Two
    // gates saying the same thing, so the UI never offers a click that throws.
    saveRunDisabled: !IS_ELECTRON || saveFetched !== true || lyricsSave.running,
    saveProgressLabel: lyricsSave.running
      ? t('lyr.sources.saveProgress', {
          current: lyricsSave.current,
          total: lyricsSave.total,
        })
      : null,
    saveSummaryLabel: summaryLabel(lyricsSave.summary, t),
    saveDisabledHint:
      IS_ELECTRON && saveFetched === false ? t('lyr.sources.saveDisabledHint') : null,
    onRunSave: () => void lyricsSave.start(),
    onCancelSave: lyricsSave.cancel,

    lyricsPlainOpacity,
    lyricsPlainFontSize,
    onSetPlainOpacity: setLyricsPlainOpacity,
    onSetPlainFontSize: setLyricsPlainFontSize,
    plainOpacityMin: LYRICS_PLAIN_OPACITY_MIN,
    plainOpacityMax: LYRICS_PLAIN_OPACITY_MAX,
    plainOpacityStep: LYRICS_PLAIN_OPACITY_STEP,

    lyricsSyncedDimOpacity,
    lyricsSyncedFontSize,
    onSetSyncedDimOpacity: setLyricsSyncedDimOpacity,
    onSetSyncedFontSize: setLyricsSyncedFontSize,
    syncedDimOpacityMin: LYRICS_SYNCED_DIM_OPACITY_MIN,
    syncedDimOpacityMax: LYRICS_SYNCED_DIM_OPACITY_MAX,
    syncedDimOpacityStep: LYRICS_SYNCED_DIM_OPACITY_STEP,
    lyricsPresentation,
    onSetPresentation: setLyricsPresentation,
    // The silent-failure guard: Focus only renders inside the Now Playing
    // view, so picking it with that view disabled would change nothing
    // visible. An observation with the pointer, not a nag.
    presentationHint:
      lyricsPresentation === 'focus' && !nowPlayingViewEnabled ? t('lyr.synced.focusHint') : null,

    isModified,
    onReset: resetLyricsAppearance,
  };
}

/**
 * The counts line for a finished run, or `null` before one.
 *
 * `notFound` and `failed` stay apart rather than being summed into "didn't
 * work": the directory not having a track is settled, while a lookup that could
 * not complete or a file that could not be written is worth another run, and
 * only the second is a reason to press the button again.
 */
function summaryLabel(
  summary: LyricsBatchSummary | null,
  t: ILyricsSectionView['t']
): string | null {
  if (summary === null) return null;

  const counts = {
    saved: summary.saved,
    skipped: summary.skipped,
    notFound: summary.notFound,
    failed: summary.failed,
  };

  return summary.cancelled
    ? t('lyr.sources.saveSummaryCancelled', counts)
    : t('lyr.sources.saveSummary', counts);
}
