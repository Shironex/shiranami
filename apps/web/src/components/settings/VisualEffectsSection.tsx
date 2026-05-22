import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import {
  LibraryBannerPreview,
  LowPerformancePreview,
  NoiseOverlayPreview,
  NowPlayingViewPreview,
} from '@/components/settings/VisualEffectsPreview';
import { useUIStore } from '@/stores/useUIStore';

export function VisualEffectsSection() {
  const { t } = useTranslation('settings');
  const nowPlayingViewEnabled = useUIStore(s => s.nowPlayingViewEnabled);
  const setNowPlayingViewEnabled = useUIStore(s => s.setNowPlayingViewEnabled);
  const libraryHeroCardEnabled = useUIStore(s => s.libraryHeroCardEnabled);
  const setLibraryHeroCardEnabled = useUIStore(s => s.setLibraryHeroCardEnabled);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const setLowPerformanceMode = useUIStore(s => s.setLowPerformanceMode);
  const noiseOverlayEnabled = useUIStore(s => s.noiseOverlayEnabled);
  const setNoiseOverlayEnabled = useUIStore(s => s.setNoiseOverlayEnabled);

  return (
    <SettingsCard icon={Sparkles} title={t('app.effects')} subtitle={t('app.effectsDesc')}>
      <SettingsToggleRow
        label={t('app.nowPlayingView')}
        description={t('app.nowPlayingViewDesc')}
        checked={nowPlayingViewEnabled}
        onCheckedChange={setNowPlayingViewEnabled}
      />
      <NowPlayingViewPreview enabled={nowPlayingViewEnabled} />

      <SettingsToggleRow
        label={t('app.libraryHeroCard')}
        description={t('app.libraryHeroCardDesc')}
        checked={libraryHeroCardEnabled}
        onCheckedChange={setLibraryHeroCardEnabled}
        divider
      />
      <LibraryBannerPreview enabled={libraryHeroCardEnabled} />

      <SettingsToggleRow
        label={t('app.lowPerfMode')}
        description={t('app.lowPerfModeDesc')}
        checked={lowPerformanceMode}
        onCheckedChange={setLowPerformanceMode}
        divider
      />
      <LowPerformancePreview enabled={lowPerformanceMode} />

      <SettingsToggleRow
        label={t('app.noiseOverlay')}
        description={t('app.noiseOverlayDesc')}
        checked={noiseOverlayEnabled}
        onCheckedChange={setNoiseOverlayEnabled}
        divider
      />
      <NoiseOverlayPreview enabled={noiseOverlayEnabled} />
    </SettingsCard>
  );
}
