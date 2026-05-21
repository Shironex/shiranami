import { useTranslation, Trans } from 'react-i18next';
import { useThemeStore } from '@/stores/useThemeStore';
import {
  useUIStore,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_STEP,
  UI_SCALE_DEFAULT,
  UI_SCALE_PRESETS,
} from '@/stores/useUIStore';
import { ThemeTileGrid } from '@/components/shared/theme/ThemeTileGrid';
import { SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { OnboardingStepLayout } from '../OnboardingStepLayout';
import { useOnboardingStepContext } from '../stepContext';

export function AppearanceStep() {
  const { t } = useTranslation('onboarding');
  const { kanji, headingId, headingRef } = useOnboardingStepContext();
  const theme = useThemeStore(s => s.theme);
  const setTheme = useThemeStore(s => s.setTheme);

  const uiScale = useUIStore(s => s.uiScale);
  const setUiScale = useUIStore(s => s.setUiScale);
  const resetUiScale = useUIStore(s => s.resetUiScale);
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const setLowPerformanceMode = useUIStore(s => s.setLowPerformanceMode);

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
      <div className="space-y-4">
        <div className="space-y-3">
          <p className="text-xs font-medium text-foreground">{t('appearance.themeTitle')}</p>
          <ThemeTileGrid value={theme} onSelect={setTheme} columns={2} />
          <p className="text-center text-[11px] text-muted-foreground/70">
            {t('appearance.themeHint')}
          </p>
        </div>

        <div className="space-y-3 border-t border-border/30 pt-4">
          <p className="text-xs font-medium text-foreground">{t('appearance.comfortTitle')}</p>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p id="onboarding-ui-scale-label" className="text-sm text-muted-foreground">
                {t('appearance.uiScale')}
              </p>
              <div className="flex items-center gap-2">
                {uiScale !== UI_SCALE_DEFAULT && (
                  <button
                    type="button"
                    onClick={resetUiScale}
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('appearance.uiScaleReset', { value: UI_SCALE_DEFAULT })}
                  </button>
                )}
                <span className="text-xs tabular-nums text-muted-foreground">{uiScale}%</span>
              </div>
            </div>
            <Slider
              aria-labelledby="onboarding-ui-scale-label"
              min={UI_SCALE_MIN}
              max={UI_SCALE_MAX}
              step={UI_SCALE_STEP}
              value={[uiScale]}
              onValueChange={([v]) => setUiScale(v)}
            />
            <div className="mt-2 flex items-center justify-between gap-1.5">
              {UI_SCALE_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={uiScale === preset}
                  onClick={() => setUiScale(preset)}
                  className={cn(
                    'flex-1 rounded-md py-1.5 text-[11px] font-medium tabular-nums transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    uiScale === preset
                      ? 'border border-primary/40 bg-primary/15 text-primary'
                      : 'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>

          <SettingsToggleRow
            divider
            label={t('appearance.reduceEffects')}
            description={t('appearance.reduceEffectsDesc')}
            checked={lowPerformanceMode}
            onCheckedChange={setLowPerformanceMode}
          />
        </div>
      </div>
    </OnboardingStepLayout>
  );
}
