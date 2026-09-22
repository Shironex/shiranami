import { Trans } from 'react-i18next';
import { ThemeTileGrid } from '@/components/shared/theme/ThemeTileGrid';
import { SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { OnboardingStepLayout } from '../../OnboardingStepLayout';
import { useAppearanceStep } from './AppearanceStep.hooks';

export default function AppearanceStep() {
  const {
    t,
    stepContext,
    theme,
    onSelectTheme,
    showBackgroundAdjust,
    uiScale,
    canResetUiScale,
    uiScaleResetLabel,
    uiScaleRange,
    uiScalePresets,
    onSetUiScale,
    onResetUiScale,
    lowPerformanceMode,
    onSetLowPerformanceMode,
    bgOpacity,
    bgOpacityPercent,
    bgOpacityRange,
    onSetBgOpacity,
    bgBlur,
    bgBlurRange,
    onSetBgBlur,
    bgDim,
    bgDimPercent,
    bgDimRange,
    onSetBgDim,
  } = useAppearanceStep();

  const presetPills = uiScalePresets.map(preset => (
    <button
      key={preset.value}
      type="button"
      aria-pressed={preset.isActive}
      onClick={() => onSetUiScale(preset.value)}
      className={cn(
        'flex-1 rounded-md py-1.5 text-[11px] font-medium tabular-nums transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        preset.isActive
          ? 'border border-primary/40 bg-primary/15 text-primary'
          : 'border border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      {preset.value}%
    </button>
  ));

  return (
    <OnboardingStepLayout
      kanji={stepContext.kanji}
      headingId={stepContext.headingId}
      headingRef={stepContext.headingRef}
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
          {/* No custom tile during first run: selecting it opens a native file
              picker, and a modal OS dialog inside onboarding is a different
              contract from the same affordance in Settings. It stays one tap
              away in Appearance once the app is actually running. */}
          <ThemeTileGrid value={theme} onSelect={onSelectTheme} columns={2} showCustom={false} />
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
                {canResetUiScale && (
                  <button
                    type="button"
                    onClick={onResetUiScale}
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {uiScaleResetLabel}
                  </button>
                )}
                <span className="text-xs tabular-nums text-muted-foreground">{uiScale}%</span>
              </div>
            </div>
            <Slider
              aria-labelledby="onboarding-ui-scale-label"
              min={uiScaleRange.min}
              max={uiScaleRange.max}
              step={uiScaleRange.step}
              value={[uiScale]}
              onValueChange={([v]) => onSetUiScale(v)}
            />
            <div className="mt-2 flex items-center justify-between gap-1.5">{presetPills}</div>
          </div>

          <SettingsToggleRow
            divider
            label={t('appearance.reduceEffects')}
            description={t('appearance.reduceEffectsDesc')}
            checked={lowPerformanceMode}
            onCheckedChange={onSetLowPerformanceMode}
          />
        </div>

        {showBackgroundAdjust && (
          <div className="space-y-4 border-t border-border/30 pt-4">
            <p className="text-xs font-medium text-foreground">{t('appearance.bgAdjustTitle')}</p>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p id="onboarding-bg-opacity-label" className="text-sm text-muted-foreground">
                  {t('appearance.bgOpacity')}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {bgOpacityPercent}%
                </span>
              </div>
              <Slider
                aria-labelledby="onboarding-bg-opacity-label"
                min={bgOpacityRange.min}
                max={bgOpacityRange.max}
                step={bgOpacityRange.step}
                value={[bgOpacity]}
                onValueChange={([v]) => onSetBgOpacity(v)}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p id="onboarding-bg-blur-label" className="text-sm text-muted-foreground">
                  {t('appearance.bgBlur')}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">{bgBlur}px</span>
              </div>
              <Slider
                aria-labelledby="onboarding-bg-blur-label"
                min={bgBlurRange.min}
                max={bgBlurRange.max}
                step={bgBlurRange.step}
                value={[bgBlur]}
                onValueChange={([v]) => onSetBgBlur(v)}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p id="onboarding-bg-dim-label" className="text-sm text-muted-foreground">
                  {t('appearance.bgDim')}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">{bgDimPercent}%</span>
              </div>
              <Slider
                aria-labelledby="onboarding-bg-dim-label"
                min={bgDimRange.min}
                max={bgDimRange.max}
                step={bgDimRange.step}
                value={[bgDim]}
                onValueChange={([v]) => onSetBgDim(v)}
              />
            </div>
          </div>
        )}
      </div>
    </OnboardingStepLayout>
  );
}
