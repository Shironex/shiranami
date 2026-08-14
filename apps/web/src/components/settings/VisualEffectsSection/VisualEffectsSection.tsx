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
import type { IChipOption } from './VisualEffectsSection.types';

const CHIP_ACTIVE = 'border border-primary/40 bg-primary/15 text-primary';
const CHIP_IDLE =
  'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground';

/** One row of vinyl option chips — the shared render for every picker. */
function OptionChips<T extends string>({
  options,
  onSelect,
}: {
  readonly options: readonly IChipOption<T>[];
  readonly onSelect: (value: T) => void;
}) {
  const chips = options.map(option => (
    <button
      key={option.value}
      onClick={() => onSelect(option.value)}
      aria-pressed={option.isActive}
      className={cn(
        'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        option.isActive ? CHIP_ACTIVE : CHIP_IDLE
      )}
    >
      {option.label}
    </button>
  ));

  return <div className="flex flex-wrap items-center gap-1.5">{chips}</div>;
}

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
    vinylSpeedTitle,
    vinylSpeedDescription,
    vinylSpeedOptions,
    onSelectVinylSpeed,
    vinylFinishTitle,
    vinylFinishDescription,
    vinylFinishOptions,
    onSelectVinylFinish,
    vinylSizeTitle,
    vinylSizeDescription,
    vinylSizeNowPlayingLabel,
    vinylSizeNowPlayingOptions,
    onSelectVinylNowPlayingSize,
    vinylSizeSanctuaryLabel,
    vinylSizeSanctuaryOptions,
    onSelectVinylSanctuarySize,
    vinylTonearmLabel,
    vinylTonearmDescription,
    vinylTonearmEnabled,
    onVinylTonearmChange,
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
              <OptionChips options={vinylLabelOptions} onSelect={onSelectVinylLabelSource} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">{vinylRingTitle}</p>
              <p className="mb-3 text-xs text-muted-foreground">{vinylRingDescription}</p>
              <OptionChips options={vinylRingOptions} onSelect={onSelectVinylRingStyle} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">{vinylSpeedTitle}</p>
              <p className="mb-3 text-xs text-muted-foreground">{vinylSpeedDescription}</p>
              <OptionChips options={vinylSpeedOptions} onSelect={onSelectVinylSpeed} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">{vinylFinishTitle}</p>
              <p className="mb-3 text-xs text-muted-foreground">{vinylFinishDescription}</p>
              <OptionChips options={vinylFinishOptions} onSelect={onSelectVinylFinish} />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">{vinylSizeTitle}</p>
              <p className="mb-3 text-xs text-muted-foreground">{vinylSizeDescription}</p>
              <div className="space-y-2">
                <div
                  role="group"
                  aria-label={vinylSizeNowPlayingLabel}
                  className="flex items-center gap-3"
                >
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {vinylSizeNowPlayingLabel}
                  </span>
                  <OptionChips
                    options={vinylSizeNowPlayingOptions}
                    onSelect={onSelectVinylNowPlayingSize}
                  />
                </div>
                <div
                  role="group"
                  aria-label={vinylSizeSanctuaryLabel}
                  className="flex items-center gap-3"
                >
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {vinylSizeSanctuaryLabel}
                  </span>
                  <OptionChips
                    options={vinylSizeSanctuaryOptions}
                    onSelect={onSelectVinylSanctuarySize}
                  />
                </div>
              </div>
            </div>
            <SettingsToggleRow
              label={vinylTonearmLabel}
              description={vinylTonearmDescription}
              checked={vinylTonearmEnabled}
              onCheckedChange={onVinylTonearmChange}
              className="py-0"
            />
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
