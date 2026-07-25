import type { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@/lib/i18n';
import type { OnboardingStepContextValue } from '../../stepContext';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One selectable interface-language pill. */
export interface IWelcomeStepLanguageOption {
  /** Language code applied and persisted on select. */
  readonly code: SupportedLanguage;
  /** Human-readable language label, in its own language. */
  readonly label: string;
  /** Whether this language is the active one. */
  readonly isActive: boolean;
}

export interface IWelcomeStepView {
  /** Bound `onboarding` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Shell-owned step chrome (kanji + heading wiring). */
  readonly stepContext: OnboardingStepContextValue;
  /** Localized eyebrow with the running app version interpolated. */
  readonly stepMarker: string;
  /** Alt text for the mascot portrait, shared with Settings · About. */
  readonly mascotAlt: string;
  /** Selectable interface languages, pre-resolved with active flags. */
  readonly languageOptions: readonly IWelcomeStepLanguageOption[];
  /** Apply and persist an interface language. */
  readonly onSelectLanguage: (lang: SupportedLanguage) => void;
}
