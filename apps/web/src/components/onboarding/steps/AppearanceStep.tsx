import { useTranslation, Trans } from 'react-i18next';
import { useThemeStore } from '@/stores/useThemeStore';
import { ThemeTileGrid } from '@/components/shared/theme/ThemeTileGrid';
import { OnboardingStepLayout } from '../OnboardingStepLayout';
import { useOnboardingStepContext } from '../stepContext';

export function AppearanceStep() {
  const { t } = useTranslation('onboarding');
  const { kanji, headingId, headingRef } = useOnboardingStepContext();
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);

  return (
    <OnboardingStepLayout
      kanji={kanji}
      headingId={headingId}
      headingRef={headingRef}
      stepMarker={t('appearance.eyebrow')}
      headline={
        <Trans
          t={t}
          i18nKey="appearance.headline"
          components={{ 1: <em className="not-italic text-primary" /> }}
        />
      }
      description={t('appearance.description')}
    >
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground">{t('appearance.themeTitle')}</p>
        <ThemeTileGrid value={theme} onSelect={setTheme} columns={2} />
        <p className="text-center text-[11px] text-muted-foreground/70">
          {t('appearance.themeHint')}
        </p>
      </div>
    </OnboardingStepLayout>
  );
}
