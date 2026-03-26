import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import {
  useAppStore,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_PRESETS,
} from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { SUPPORTED_LANGUAGES, persistLanguage, type SupportedLanguage } from '@/lib/i18n';

export function AppearanceSection() {
  const { t, i18n } = useTranslation('settings');
  const { t: tc } = useTranslation('common');
  const uiScale = useAppStore((s) => s.uiScale);
  const setUiScale = useAppStore((s) => s.setUiScale);
  const resetUiScale = useAppStore((s) => s.resetUiScale);

  function handleLanguageChange(lang: SupportedLanguage) {
    i18n.changeLanguage(lang);
    persistLanguage(lang);
  }

  return (
    <SettingsCard
      icon={Monitor}
      title={t('app.title')}
      subtitle={t('app.subtitle')}
    >
      <div className="space-y-6">
        {/* Language */}
        <div className="px-3">
          <p className="text-sm font-medium text-foreground mb-1">{t('app.languageTitle')}</p>
          <p className="text-xs text-muted-foreground mb-3">
            {t('app.languageDesc')}
          </p>
          <div className="flex items-center gap-1.5">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  i18n.language === lang.code
                    ? 'bg-primary/15 text-primary border border-primary/40'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent',
                )}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interface scale */}
        <div className="px-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-foreground">{t('app.interfaceScale')}</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {uiScale}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {t('app.scaleDesc')}
          </p>

          <Slider
            min={UI_SCALE_MIN}
            max={UI_SCALE_MAX}
            step={UI_SCALE_STEP}
            value={[uiScale]}
            onValueChange={([v]) => setUiScale(v)}
          />

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-1.5">
              {UI_SCALE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setUiScale(preset)}
                  className={cn(
                    'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                    uiScale === preset
                      ? 'bg-primary/15 text-primary border border-primary/40'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent',
                  )}
                >
                  {preset}%
                </button>
              ))}
            </div>

            {uiScale !== UI_SCALE_DEFAULT && (
              <button
                onClick={resetUiScale}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {tc('reset')}
              </button>
            )}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
