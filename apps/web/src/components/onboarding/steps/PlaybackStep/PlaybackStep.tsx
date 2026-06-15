import { Trans } from 'react-i18next';
import { SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { OnboardingStepLayout } from '../../OnboardingStepLayout';
import { usePlaybackStep } from './PlaybackStep.hooks';

const CROSSFADE_MIN = 1;
const CROSSFADE_MAX = 12;

export default function PlaybackStep() {
  const {
    t,
    stepContext,
    rememberPlaybackPosition,
    onSetRememberPlaybackPosition,
    crossfadeEnabled,
    onSetCrossfadeEnabled,
    crossfadeDuration,
    onSetCrossfadeDuration,
    showDiscord,
    discordRpc,
    onSetDiscordRpc,
  } = usePlaybackStep();

  return (
    <OnboardingStepLayout
      kanji={stepContext.kanji}
      headingId={stepContext.headingId}
      headingRef={stepContext.headingRef}
      stepMarker={t('playback.eyebrow')}
      headline={
        <Trans
          t={t}
          i18nKey="playback.headline"
          components={{ 1: <em className="not-italic text-primary" /> }}
        />
      }
      description={t('playback.description')}
    >
      <div>
        <SettingsToggleRow
          label={t('playback.resume')}
          description={t('playback.resumeDesc')}
          checked={rememberPlaybackPosition}
          onCheckedChange={onSetRememberPlaybackPosition}
        />

        <SettingsToggleRow
          divider
          label={t('playback.crossfade')}
          description={t('playback.crossfadeDesc')}
          checked={crossfadeEnabled}
          onCheckedChange={onSetCrossfadeEnabled}
        />

        {crossfadeEnabled && (
          <div className="px-3 pb-1 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p id="onboarding-crossfade-label" className="text-sm text-muted-foreground">
                {t('playback.crossfadeDuration')}
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">
                {crossfadeDuration}s
              </span>
            </div>
            <Slider
              aria-labelledby="onboarding-crossfade-label"
              min={CROSSFADE_MIN}
              max={CROSSFADE_MAX}
              step={1}
              value={[crossfadeDuration]}
              onValueChange={([v]) => onSetCrossfadeDuration(v)}
            />
            <div className="mt-1 flex justify-between">
              <span className="text-[10px] text-muted-foreground/60">{CROSSFADE_MIN}s</span>
              <span className="text-[10px] text-muted-foreground/60">{CROSSFADE_MAX}s</span>
            </div>
          </div>
        )}

        {showDiscord && (
          <SettingsToggleRow
            divider
            label={t('playback.discord')}
            description={t('playback.discordDesc')}
            checked={discordRpc}
            onCheckedChange={onSetDiscordRpc}
          />
        )}
      </div>
    </OnboardingStepLayout>
  );
}
