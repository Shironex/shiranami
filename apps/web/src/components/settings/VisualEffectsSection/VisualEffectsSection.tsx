import { AudioLines, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { VinylPreview } from '@/components/settings/VinylPreview';
import { useVisualEffectsSection } from './VisualEffectsSection.hooks';

const CHIP_ACTIVE = 'border border-primary/40 bg-primary/15 text-primary';
const CHIP_IDLE =
  'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground';

export default function VisualEffectsSection() {
  const {
    title,
    subtitle,
    nowPlayingLabel,
    nowPlayingDescription,
    nowPlayingViewEnabled,
    onNowPlayingChange,
    vinylDisplayLabel,
    vinylDisplayDescription,
    vinylDisplayEnabled,
    onVinylDisplayChange,
    vinylLabelTitle,
    vinylLabelDescription,
    vinylLabelOptions,
    onSelectVinylLabelSource,
    vinylRingTitle,
    vinylRingDescription,
    vinylRingOptions,
    onSelectVinylRingStyle,
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
    roomLightLabel,
    roomLightDescription,
    roomLightEnabled,
    onRoomLightChange,
    tempoBreathingLabel,
    tempoBreathingDescription,
    tempoBreathingEnabled,
    onTempoBreathingChange,
    tempoBreathingHint,
  } = useVisualEffectsSection();

  const vinylLabelChips = vinylLabelOptions.map(option => (
    <button
      key={option.value}
      onClick={() => onSelectVinylLabelSource(option.value)}
      aria-pressed={option.isActive}
      className={cn(
        'focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        option.isActive ? CHIP_ACTIVE : CHIP_IDLE
      )}
    >
      {option.label}
    </button>
  ));

  const vinylRingChips = vinylRingOptions.map(option => (
    <button
      key={option.value}
      onClick={() => onSelectVinylRingStyle(option.value)}
      aria-pressed={option.isActive}
      className={cn(
        'focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        option.isActive ? CHIP_ACTIVE : CHIP_IDLE
      )}
    >
      {option.label}
    </button>
  ));

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
          label={vinylDisplayLabel}
          description={vinylDisplayDescription}
          checked={vinylDisplayEnabled}
          onCheckedChange={onVinylDisplayChange}
          divider
        />
        <VinylPreview enabled={vinylDisplayEnabled} />

        {vinylDisplayEnabled && (
          <div className="space-y-4 px-3" data-slot="vinyl-display-options">
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">{vinylLabelTitle}</p>
              <p className="mb-3 text-xs text-muted-foreground">{vinylLabelDescription}</p>
              <div className="flex items-center gap-1.5">{vinylLabelChips}</div>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">{vinylRingTitle}</p>
              <p className="mb-3 text-xs text-muted-foreground">{vinylRingDescription}</p>
              <div className="flex items-center gap-1.5">{vinylRingChips}</div>
            </div>
          </div>
        )}

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
          label={roomLightLabel}
          description={roomLightDescription}
          checked={roomLightEnabled}
          onCheckedChange={onRoomLightChange}
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
