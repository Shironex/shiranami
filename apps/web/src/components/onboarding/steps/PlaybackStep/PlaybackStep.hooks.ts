import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useSettingsQuery, useUpdateSettingsMutation } from '@/hooks/queries/useSettings';
import {
  useDiscordRpcSettingsQuery,
  useUpdateDiscordRpcSettingsMutation,
} from '@/hooks/queries/useDiscordRpc';
import { useOnboardingStepContext } from '../../stepContext';
import type { IPlaybackStepView } from './PlaybackStep.types';

/**
 * Surfaces the three highest-value first-run playback prefs over the existing
 * settings query/store — resume position, crossfade (with its duration slider
 * when on), and Discord Rich Presence (desktop-only, owner add). Composes
 * primitives directly rather than reusing PlaybackSection's card-shaped layout,
 * which would drag in the controls onboarding deliberately leaves in Settings.
 */
export function usePlaybackStep(): IPlaybackStepView {
  const { t } = useTranslation('onboarding');
  const stepContext = useOnboardingStepContext();

  const { data: settings } = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();
  const rememberPlaybackPosition = settings?.rememberPlaybackPosition ?? false;

  const { data: discordSettings } = useDiscordRpcSettingsQuery();
  const updateDiscord = useUpdateDiscordRpcSettingsMutation();
  const discordRpc = discordSettings?.enabled ?? false;

  const crossfadeEnabled = usePlaybackStore(s => s.crossfadeEnabled);
  const crossfadeDuration = usePlaybackStore(s => s.crossfadeDuration);
  const setCrossfadeEnabled = usePlaybackStore(s => s.setCrossfadeEnabled);
  const setCrossfadeDuration = usePlaybackStore(s => s.setCrossfadeDuration);

  return {
    t,
    stepContext,
    rememberPlaybackPosition,
    onSetRememberPlaybackPosition: value =>
      updateSettings.mutate({ rememberPlaybackPosition: value }),
    crossfadeEnabled,
    onSetCrossfadeEnabled: setCrossfadeEnabled,
    crossfadeDuration,
    onSetCrossfadeDuration: setCrossfadeDuration,
    showDiscord: IS_ELECTRON,
    discordRpc,
    onSetDiscordRpc: value => updateDiscord.mutate({ enabled: value }),
  };
}
