import { useTranslation, Trans } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/hooks/queries/useSettings';
import { SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { OnboardingStepLayout } from '../OnboardingStepLayout';
import { useOnboardingStepContext } from '../stepContext';

/**
 * Step 04 · Playback. Surfaces the three highest-value first-run playback prefs
 * over the existing settings query/store — resume position, crossfade (with its
 * duration slider when on), and Discord Rich Presence (desktop-only, owner add).
 * Composes primitives directly rather than reusing PlaybackSection's card-shaped
 * layout, which would drag in the controls onboarding deliberately leaves in
 * Settings.
 */
export function PlaybackStep() {
  const { t } = useTranslation('onboarding');
  const { kanji, headingId, headingRef } = useOnboardingStepContext();

  const { data: settings } = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();
  const rememberPlaybackPosition = settings?.rememberPlaybackPosition ?? false;
  const discordRpc = settings?.discordRpc ?? false;

  const crossfadeEnabled = usePlaybackStore(s => s.crossfadeEnabled);
  const crossfadeDuration = usePlaybackStore(s => s.crossfadeDuration);
  const setCrossfadeEnabled = usePlaybackStore(s => s.setCrossfadeEnabled);
  const setCrossfadeDuration = usePlaybackStore(s => s.setCrossfadeDuration);

  return (
    <OnboardingStepLayout
      kanji={kanji}
      headingId={headingId}
      headingRef={headingRef}
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
          onCheckedChange={v => updateSettings.mutate({ rememberPlaybackPosition: v })}
        />

        <SettingsToggleRow
          divider
          label={t('playback.crossfade')}
          description={t('playback.crossfadeDesc')}
          checked={crossfadeEnabled}
          onCheckedChange={setCrossfadeEnabled}
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
              min={1}
              max={12}
              step={1}
              value={[crossfadeDuration]}
              onValueChange={([v]) => setCrossfadeDuration(v)}
            />
            <div className="mt-1 flex justify-between">
              <span className="text-[10px] text-muted-foreground/60">1s</span>
              <span className="text-[10px] text-muted-foreground/60">12s</span>
            </div>
          </div>
        )}

        {IS_ELECTRON && (
          <SettingsToggleRow
            divider
            label={t('playback.discord')}
            description={t('playback.discordDesc')}
            checked={discordRpc}
            onCheckedChange={v => updateSettings.mutate({ discordRpc: v })}
          />
        )}
      </div>
    </OnboardingStepLayout>
  );
}
