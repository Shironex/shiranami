import type { useTranslation } from 'react-i18next';
import type { OnboardingStepContextValue } from '../../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface IPlaybackStepView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shell-owned step chrome (kanji + heading wiring). */
  readonly stepContext: OnboardingStepContextValue;
  /** Whether "resume where I left off" is on. */
  readonly rememberPlaybackPosition: boolean;
  /** Toggle resume-playback-position. */
  readonly onSetRememberPlaybackPosition: (value: boolean) => void;
  /** Whether crossfade is on. */
  readonly crossfadeEnabled: boolean;
  /** Toggle crossfade. */
  readonly onSetCrossfadeEnabled: (value: boolean) => void;
  /** Crossfade duration in seconds. */
  readonly crossfadeDuration: number;
  /** Set the crossfade duration. */
  readonly onSetCrossfadeDuration: (value: number) => void;
  /** Whether the Discord Rich Presence toggle is shown (desktop only). */
  readonly showDiscord: boolean;
  /** Whether Discord Rich Presence is on. */
  readonly discordRpc: boolean;
  /** Toggle Discord Rich Presence. */
  readonly onSetDiscordRpc: (value: boolean) => void;
}
