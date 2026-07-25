import { useTranslation } from 'react-i18next';
import { useAppVersion } from '@/hooks/useAppVersion';
import { SUPPORTED_LANGUAGES, persistLanguage, type SupportedLanguage } from '@/lib/i18n';
import { useOnboardingStepContext } from '../../stepContext';
import type { IWelcomeStepLanguageOption, IWelcomeStepView } from './WelcomeStep.types';

export function useWelcomeStep(): IWelcomeStepView {
  const { t, i18n } = useTranslation('onboarding');
  const stepContext = useOnboardingStepContext();
  const version = useAppVersion();

  function onSelectLanguage(lang: SupportedLanguage): void {
    void i18n.changeLanguage(lang);
    persistLanguage(lang);
  }

  const languageOptions: IWelcomeStepLanguageOption[] = SUPPORTED_LANGUAGES.map(lang => ({
    code: lang.code,
    label: lang.label,
    isActive: i18n.language === lang.code,
  }));

  return {
    t,
    stepContext,
    // The version resolves asynchronously, so the ellipsis holds the eyebrow's
    // shape for the frame before it lands.
    stepMarker: t('welcome.eyebrow', { version: version ?? '…' }),
    mascotAlt: t('abt.altMascot', { ns: 'settings' }),
    languageOptions,
    onSelectLanguage,
  };
}
