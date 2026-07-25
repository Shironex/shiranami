import { Sparkles } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { LibraryBannerPreview } from '@/components/settings/LibraryBannerPreview';
import { LowPerformancePreview } from '@/components/settings/LowPerformancePreview';
import { NoiseOverlayPreview } from '@/components/settings/NoiseOverlayPreview';
import { NowPlayingViewPreview } from '@/components/settings/NowPlayingViewPreview';
import { useVisualEffectsSection } from './VisualEffectsSection.hooks';

export default function VisualEffectsSection() {
  const {
    title,
    subtitle,
    nowPlayingLabel,
    nowPlayingDescription,
    nowPlayingViewEnabled,
    onNowPlayingChange,
    libraryHeroLabel,
    libraryHeroDescription,
    libraryHeroCardEnabled,
    onLibraryHeroChange,
    lowPerfLabel,
    lowPerfDescription,
    lowPerformanceMode,
    onLowPerfChange,
    noiseLabel,
    noiseDescription,
    noiseOverlayEnabled,
    onNoiseChange,
  } = useVisualEffectsSection();

  return (
    <SettingsCard icon={Sparkles} title={title} subtitle={subtitle}>
      <SettingsToggleRow
        label={nowPlayingLabel}
        description={nowPlayingDescription}
        checked={nowPlayingViewEnabled}
        onCheckedChange={onNowPlayingChange}
      />
      <NowPlayingViewPreview enabled={nowPlayingViewEnabled} />

      <SettingsToggleRow
        label={libraryHeroLabel}
        description={libraryHeroDescription}
        checked={libraryHeroCardEnabled}
        onCheckedChange={onLibraryHeroChange}
        divider
      />
      <LibraryBannerPreview enabled={libraryHeroCardEnabled} />

      <SettingsToggleRow
        label={lowPerfLabel}
        description={lowPerfDescription}
        checked={lowPerformanceMode}
        onCheckedChange={onLowPerfChange}
        divider
      />
      <LowPerformancePreview enabled={lowPerformanceMode} />

      <SettingsToggleRow
        label={noiseLabel}
        description={noiseDescription}
        checked={noiseOverlayEnabled}
        onCheckedChange={onNoiseChange}
        divider
      />
      <NoiseOverlayPreview enabled={noiseOverlayEnabled} />
    </SettingsCard>
  );
}
