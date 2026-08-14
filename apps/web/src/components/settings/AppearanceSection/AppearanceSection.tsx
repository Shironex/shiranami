import { Languages, Paintbrush, Palette, RotateCcw } from 'lucide-react';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { ThemeTileGrid } from '@/components/shared/theme/ThemeTileGrid';
import { AccentColorPicker } from '@/components/settings/AccentColorPicker';
import { BackgroundLibraryManager } from '@/components/settings/BackgroundLibraryManager';
import { AccentPreview } from '@/components/settings/AccentPreview';
import { UiScalePreview } from '@/components/settings/UiScalePreview';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { ThemeBackgroundPreview } from '@/components/settings/ThemeBackgroundPreview';
import { useAppearanceSection } from './AppearanceSection.hooks';

export default function AppearanceSection() {
  const {
    t,
    resetLabel,
    languageOptions,
    onSelectLanguage,
    uiScale,
    uiScaleMin,
    uiScaleMax,
    uiScaleStep,
    isScaleModified,
    scalePresets,
    onSetUiScale,
    onResetUiScale,
    theme,
    hasThemeBackground,
    onSelectTheme,
    isCustomTheme,
    customThumb,
    customBackgroundFailed,
    onRetryCustomBackground,
    isBgModified,
    bgOpacity,
    bgOpacityPercent,
    bgOpacityMin,
    bgOpacityMax,
    bgOpacityStep,
    bgBlur,
    bgBlurMin,
    bgBlurMax,
    bgBlurStep,
    bgDim,
    bgDimPercent,
    bgDimMin,
    bgDimMax,
    bgDimStep,
    onSetBgOpacity,
    onSetBgBlur,
    onSetBgDim,
    bgFit,
    bgFitOptions,
    onSetBgFit,
    onResetBg,
    hasAccentOverride,
    onResetAccent,
    followArtAccent,
    onFollowArtChange,
  } = useAppearanceSection();

  const languageButtons = languageOptions.map(lang => (
    <button
      key={lang.code}
      onClick={() => onSelectLanguage(lang.code)}
      className={cn(
        'focus-ring px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
        lang.isActive
          ? 'bg-primary/15 text-primary border border-primary/40'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
      )}
    >
      {lang.label}
    </button>
  ));

  const scalePresetButtons = scalePresets.map(preset => (
    <button
      key={preset.value}
      onClick={() => onSetUiScale(preset.value)}
      className={cn(
        'focus-ring px-2 py-1 rounded-md text-xs font-medium transition-colors',
        preset.isActive
          ? 'bg-primary/15 text-primary border border-primary/40'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
      )}
    >
      {preset.value}%
    </button>
  ));

  const showBackgroundReadError = isCustomTheme && customBackgroundFailed;

  // Roving tabindex: exactly one radio in a group is tabbable and the arrows
  // move between them. Two native buttons both carrying `role="radio"` would
  // otherwise put two stops in the tab order and answer nothing to an arrow
  // key — a dead end in forms mode, even though it looks correct.
  const onFitKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const current = Math.max(0, bgFitOptions.indexOf(bgFit));
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    onSetBgFit(bgFitOptions[(current + delta + bgFitOptions.length) % bgFitOptions.length]);
  };

  const fitButtons = bgFitOptions.map(option => (
    <button
      key={option}
      type="button"
      role="radio"
      aria-checked={bgFit === option}
      tabIndex={bgFit === option ? 0 : -1}
      onClick={() => onSetBgFit(option)}
      className={cn(
        'focus-ring rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
        bgFit === option
          ? 'border-primary/60 bg-primary/10 text-foreground'
          : 'border-border/50 text-muted-foreground hover:text-foreground'
      )}
    >
      {t(`app.bgAdjust.fitOptions.${option}`)}
    </button>
  ));

  return (
    <div className="space-y-4">
      {/* Card 1 — Language & scale */}
      <SettingsCard icon={Languages} title={t('app.languageScaleTitle')}>
        <div className="space-y-6">
          {/* Language picker */}
          <div className="px-3">
            <p className="text-sm font-medium text-foreground mb-1">{t('app.languageTitle')}</p>
            <p className="text-xs text-muted-foreground mb-3">{t('app.languageDesc')}</p>
            <div className="flex items-center gap-1.5">{languageButtons}</div>
          </div>

          {/* Interface scale */}
          <div className="px-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-foreground">{t('app.interfaceScale')}</p>
              <span className="text-xs tabular-nums text-muted-foreground">{uiScale}%</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t('app.scaleDesc')}</p>

            <Slider
              min={uiScaleMin}
              max={uiScaleMax}
              step={uiScaleStep}
              value={[uiScale]}
              onValueChange={([v]) => onSetUiScale(v)}
            />

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-1.5">{scalePresetButtons}</div>

              {isScaleModified && (
                <button
                  onClick={onResetUiScale}
                  className="focus-ring rounded-sm text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {resetLabel}
                </button>
              )}
            </div>

            <SettingsCard tone="info" className="!p-3 mt-4">
              <UiScalePreview scale={uiScale} />
            </SettingsCard>
          </div>
        </div>
      </SettingsCard>

      {/* Card 2 — Theme */}
      <SettingsCard icon={Palette} title={t('app.theme.title')} subtitle={t('app.theme.desc')}>
        <ThemeTileGrid value={theme} onSelect={onSelectTheme} customThumb={customThumb} />

        {isCustomTheme && (
          <div className="mt-3 border-t border-border/40 pt-4">
            <div className="mb-3 px-3">
              <p className="text-sm font-medium text-foreground">
                {t('app.background.library.title')}
              </p>
              <p className="text-xs text-muted-foreground">{t('app.background.library.desc')}</p>
            </div>
            <BackgroundLibraryManager />
          </div>
        )}

        {showBackgroundReadError && (
          <div className="mt-2 flex items-center gap-2 px-3" role="alert">
            <p className="text-[11px] text-destructive">{t('app.background.errors.readFailed')}</p>
            <button
              type="button"
              onClick={onRetryCustomBackground}
              className="focus-ring rounded-lg px-2 py-1 text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
            >
              {t('app.background.retry')}
            </button>
          </div>
        )}

        {hasThemeBackground && (
          <div className="px-3 pt-4 border-t border-border/40 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{t('app.bgAdjust.title')}</p>
              {isBgModified && (
                <button
                  onClick={onResetBg}
                  className="focus-ring rounded-sm flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={t('app.bgAdjust.reset')}
                >
                  <RotateCcw className="size-3" />
                  {t('app.bgAdjust.reset')}
                </button>
              )}
            </div>

            {/* Opacity */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-foreground">{t('app.bgAdjust.opacity')}</p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {bgOpacityPercent}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t('app.bgAdjust.opacityDesc')}</p>
              <Slider
                min={bgOpacityMin}
                max={bgOpacityMax}
                step={bgOpacityStep}
                value={[bgOpacity]}
                onValueChange={([v]) => onSetBgOpacity(v)}
              />
            </div>

            {/* Blur */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-foreground">{t('app.bgAdjust.blur')}</p>
                <span className="text-xs tabular-nums text-muted-foreground">{bgBlur}px</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t('app.bgAdjust.blurDesc')}</p>
              <Slider
                min={bgBlurMin}
                max={bgBlurMax}
                step={bgBlurStep}
                value={[bgBlur]}
                onValueChange={([v]) => onSetBgBlur(v)}
              />
            </div>

            {/* Dim */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-foreground">{t('app.bgAdjust.dim')}</p>
                <span className="text-xs tabular-nums text-muted-foreground">{bgDimPercent}%</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{t('app.bgAdjust.dimDesc')}</p>
              <Slider
                min={bgDimMin}
                max={bgDimMax}
                step={bgDimStep}
                value={[bgDim]}
                onValueChange={([v]) => onSetBgDim(v)}
              />
            </div>

            {/* Fit — only meaningful for an imported image. The five bundled
                photos are cropped for `cover`, so offering `contain` on them
                would letterbox a picture that was composed not to be. */}
            {isCustomTheme && (
              <div>
                <p className="text-sm font-medium text-foreground mb-1">{t('app.bgAdjust.fit')}</p>
                <p className="text-xs text-muted-foreground mb-3">{t('app.bgAdjust.fitDesc')}</p>
                <div
                  role="radiogroup"
                  aria-label={t('app.bgAdjust.fit')}
                  onKeyDown={onFitKeyDown}
                  className="flex gap-2"
                >
                  {fitButtons}
                </div>
              </div>
            )}

            {/* Contained preview — the settings glass panel covers most of the
                live canvas, so a scaled sample is the only honest way to judge
                blur/dim while dragging. tone="info" reads as a reflection. */}
            <SettingsCard tone="info" className="!p-3">
              <SettingsPreview title={t('app.bgAdjust.previewTitle')}>
                <ThemeBackgroundPreview />
              </SettingsPreview>
            </SettingsCard>
          </div>
        )}
      </SettingsCard>

      {/* Card 3 — Accent color */}
      <SettingsCard
        icon={Paintbrush}
        title={t('app.accent.title')}
        subtitle={t('app.accent.desc')}
        headerRight={
          hasAccentOverride ? (
            <button
              onClick={onResetAccent}
              className="focus-ring rounded-sm flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('app.accent.reset')}
            >
              <RotateCcw className="size-3" />
              {t('app.accent.reset')}
            </button>
          ) : undefined
        }
      >
        {/* "Follow the record" — the accent becomes the playing cover's
            clamped vibrant swatch. The manual picker below stays usable while
            this is on; picking a swatch turns follow-art back off (an explicit
            choice always wins). */}
        <SettingsToggleRow
          label={t('app.accent.followArt')}
          description={t('app.accent.followArtDesc')}
          checked={followArtAccent}
          onCheckedChange={onFollowArtChange}
        />

        <div className="px-3 pb-1">
          <AccentColorPicker />
        </div>

        <SettingsCard tone="info" className="!p-3">
          <AccentPreview />
        </SettingsCard>
      </SettingsCard>
    </div>
  );
}
