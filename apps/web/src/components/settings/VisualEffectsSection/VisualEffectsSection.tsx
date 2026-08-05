import { AudioLines, Sparkles } from 'lucide-react';
import {
  SettingsCard,
  SettingsInfoCallout,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { LibraryBannerPreview } from '@/components/settings/LibraryBannerPreview';
import { LowPerformancePreview } from '@/components/settings/LowPerformancePreview';
import { NoiseOverlayPreview } from '@/components/settings/NoiseOverlayPreview';
import { NowPlayingViewPreview } from '@/components/settings/NowPlayingViewPreview';
import { SanctuarySection } from '@/components/settings/SanctuarySection';
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
    artworkBloomLabel,
    artworkBloomDescription,
    artworkBloomEnabled,
    onArtworkBloomChange,
    coverCrossfadeLabel,
    coverCrossfadeDescription,
    coverCrossfadeEnabled,
    onCoverCrossfadeChange,
    tempoBreathingLabel,
    tempoBreathingDescription,
    tempoBreathingEnabled,
    onTempoBreathingChange,
    tempoBreathingHint,
  } = useVisualEffectsSection();

  return (
    <div className="space-y-4">
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

        <SettingsToggleRow
          label={artworkBloomLabel}
          description={artworkBloomDescription}
          checked={artworkBloomEnabled}
          onCheckedChange={onArtworkBloomChange}
          divider
        />

        <SettingsToggleRow
          label={coverCrossfadeLabel}
          description={coverCrossfadeDescription}
          checked={coverCrossfadeEnabled}
          onCheckedChange={onCoverCrossfadeChange}
          divider
        />

        <SettingsToggleRow
          label={tempoBreathingLabel}
          description={tempoBreathingDescription}
          checked={tempoBreathingEnabled}
          onCheckedChange={onTempoBreathingChange}
          divider
        />
        {tempoBreathingHint && (
          <SettingsInfoCallout icon={AudioLines}>{tempoBreathingHint}</SettingsInfoCallout>
        )}
      </SettingsCard>

      {/* Sanctuary Mode (fullscreen immersive player) lives on the same
          effects page — it is the biggest visual effect of them all. */}
      <SanctuarySection />
    </div>
  );
}
