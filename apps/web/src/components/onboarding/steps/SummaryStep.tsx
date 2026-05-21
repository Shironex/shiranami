import { useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Languages, FolderOpen, ArrowDownToLine, Music2, Palette, Waves } from 'lucide-react';
import { IS_ELECTRON } from '@/lib/platform';
import { SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import { useSettingsQuery } from '@/hooks/queries/useSettings';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useUIStore } from '@/stores/useUIStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { useDownloadsSettings } from '@/components/settings/downloads/useDownloadsSettings';
import { THEME_TILES } from '@/components/shared/theme/ThemeTileGrid';
import { VISUALIZER_STYLES } from '@/components/player/visualizerRegistry';
import { OnboardingStepLayout } from '../OnboardingStepLayout';
import { useOnboardingStepContext } from '../stepContext';
import { SummaryRow } from '../SummaryRow';

/**
 * Step 06 · Summary. Read-only recap of every choice the wizard touched, read
 * live from the same stores/queries each step writes to. The primary button
 * ("Open library") and fog-out finish live in the wizard chrome — this step
 * adds no actions, no effects.
 */
export function SummaryStep() {
  const { t, i18n } = useTranslation('onboarding');
  const { kanji, headingId, headingRef } = useOnboardingStepContext();

  const { data: folders = [] } = useFoldersQuery();
  const { data: settings } = useSettingsQuery();
  const tools = useDownloadsSettings();

  const crossfadeEnabled = usePlaybackStore(s => s.crossfadeEnabled);
  const crossfadeDuration = usePlaybackStore(s => s.crossfadeDuration);
  const theme = useThemeStore(s => s.theme);
  const visualizerStyle = useUIStore(s => s.visualizerStyle);

  const languageValue = useMemo(() => {
    const match = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language);
    return match?.label ?? t('summary.value.none');
  }, [i18n.language, t]);

  const toolsValue = useMemo(() => {
    if (!IS_ELECTRON || tools.isCheckingDownloadTools) return t('summary.tools.checking');
    if (tools.ytdlpInstalled && tools.ffmpegInstalled) return t('summary.tools.both');
    if (tools.ytdlpInstalled) return t('summary.tools.ytdlpOnly');
    if (tools.ffmpegInstalled) return t('summary.tools.ffmpegOnly');
    return t('summary.tools.none');
  }, [tools.isCheckingDownloadTools, tools.ytdlpInstalled, tools.ffmpegInstalled, t]);

  const playbackValue = useMemo(() => {
    const parts = [
      settings?.rememberPlaybackPosition
        ? t('summary.playback.resumeOn')
        : t('summary.playback.resumeOff'),
      crossfadeEnabled
        ? t('summary.playback.crossfade', { seconds: crossfadeDuration })
        : t('summary.playback.noCrossfade'),
    ];
    if (IS_ELECTRON && settings?.discordRpc) parts.push(t('summary.playback.discordOn'));
    return parts.join(' · ');
  }, [
    settings?.rememberPlaybackPosition,
    settings?.discordRpc,
    crossfadeEnabled,
    crossfadeDuration,
    t,
  ]);

  const themeValue = useMemo(() => {
    const tile = THEME_TILES.find(item => item.id === theme);
    return tile
      ? t(`app.theme.names.${tile.nameKey}`, { ns: 'settings' })
      : t('summary.value.none');
  }, [theme, t]);

  const visualizerValue = useMemo(() => {
    const meta = VISUALIZER_STYLES.find(v => v.value === visualizerStyle);
    return meta ? t(meta.labelKey, { ns: 'settings' }) : t('summary.value.none');
  }, [visualizerStyle, t]);

  return (
    <OnboardingStepLayout
      kanji={kanji}
      headingId={headingId}
      headingRef={headingRef}
      stepMarker={t('summary.eyebrow')}
      headline={
        <Trans
          t={t}
          i18nKey="summary.headline"
          components={{ 1: <em className="not-italic text-primary" /> }}
        />
      }
      description={t('summary.description')}
    >
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground">{t('summary.intro')}</p>
        <div role="list" aria-label={t('summary.listAria')} className="flex flex-col gap-2">
          <SummaryRow
            icon={<Languages />}
            label={t('summary.row.language')}
            value={languageValue}
          />
          <SummaryRow
            icon={<FolderOpen />}
            label={t('summary.row.folders')}
            value={t('summary.folders', { count: folders.length })}
            highlight={folders.length > 0}
          />
          {IS_ELECTRON && (
            <SummaryRow
              icon={<ArrowDownToLine />}
              label={t('summary.row.tools')}
              value={toolsValue}
            />
          )}
          <SummaryRow icon={<Music2 />} label={t('summary.row.playback')} value={playbackValue} />
          <SummaryRow icon={<Palette />} label={t('summary.row.theme')} value={themeValue} />
          <SummaryRow
            icon={<Waves />}
            label={t('summary.row.visualizer')}
            value={visualizerValue}
          />
        </div>
      </div>
    </OnboardingStepLayout>
  );
}
