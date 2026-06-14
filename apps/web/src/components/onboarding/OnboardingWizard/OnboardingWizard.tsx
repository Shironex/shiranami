import { ArrowLeft, ArrowRight, Play, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';
import { Button } from '@/components/ui/button';
import { WindowControls } from '@/components/shared/WindowControls';
import { OnboardingScene } from '../OnboardingScene';
import { OnboardingStepContext } from '../stepContext';
import { useOnboardingWizard } from './OnboardingWizard.hooks';
import type { IOnboardingWizardProps } from './OnboardingWizard.types';

/**
 * First-run setup wizard. Full-screen overlay shown once after the splash on a
 * user's first launch. Skippable steps; Skip == complete (we never show
 * onboarding twice). Lazy-loaded by App.tsx so it never ships to returning
 * users — hence the default export.
 */
export default function OnboardingWizard({ onComplete }: IOnboardingWizardProps) {
  const {
    t,
    steps,
    currentStep,
    stepContextValue,
    containerRef,
    isFirst,
    isLast,
    disableMotion,
    isExiting,
    isEntering,
    primaryLabel,
    onPrimary,
    onBack,
    onSkip,
  } = useOnboardingWizard({ onComplete });

  const StepComponent = currentStep.Component;

  const progressDots = steps.map(step => (
    <button
      key={step.id}
      type="button"
      aria-label={step.dotLabel}
      aria-current={step.isActive ? 'step' : undefined}
      onClick={step.onSelect}
      className={cn(
        'h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        step.isActive ? 'w-6 bg-primary' : 'w-1.5 bg-foreground/25 hover:bg-foreground/40'
      )}
    />
  ));

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('wizard.ariaLabel')}
      className={cn(
        'fixed inset-0 z-[9998] overflow-hidden bg-background',
        IS_ELECTRON && 'rounded-t-[10px]'
      )}
      style={{
        transition: disableMotion ? undefined : 'opacity 520ms ease-out, filter 520ms ease-out',
        opacity: isExiting || isEntering ? 0 : 1,
        filter: isExiting && !disableMotion ? 'blur(8px)' : 'blur(0px)',
      }}
    >
      {/* Drag strip — keeps the frameless window movable */}
      {IS_ELECTRON && <div className="absolute inset-x-0 top-0 h-8 drag" />}

      {/* Window controls — frameless chrome (Windows only; no-ops on mac/web).
          The wizard sits above the shell, so it owns its own controls here. */}
      <div className="absolute right-0 top-0 z-30 flex h-8 items-center pr-1">
        <WindowControls />
      </div>

      {/* Rainy-window backdrop */}
      <OnboardingScene reducedMotion={disableMotion} />

      {/* Skip — always visible, top-right. Shifts left to clear the window
          controls when they're present (Windows/Linux); hugs the corner on
          macOS and web where the wizard draws no custom controls. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onSkip}
        className={cn(
          'no-drag absolute top-0 z-30 h-8 gap-1.5 text-muted-foreground hover:text-foreground',
          IS_ELECTRON && !IS_MAC ? 'right-[8.5rem]' : 'right-4'
        )}
      >
        <SkipForward className="h-3.5 w-3.5" />
        {t('wizard.skip')}
      </Button>

      {/* Step content */}
      <div className="relative z-10 flex h-full flex-col px-6 pb-6 pt-16 md:px-12 md:pb-10 md:pt-16">
        <div className="flex min-h-0 flex-1 items-center">
          <OnboardingStepContext.Provider value={stepContextValue}>
            <StepComponent />
          </OnboardingStepContext.Provider>
        </div>

        {/* Footer nav */}
        <footer className="no-drag relative z-10 mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {!isFirst && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('wizard.back')}
              </Button>
            )}
          </div>

          {/* Progress dots */}
          <div
            role="group"
            aria-label={t('wizard.progressAria')}
            className="flex items-center gap-2"
          >
            {progressDots}
          </div>

          <Button type="button" onClick={onPrimary} className="gap-1.5">
            {primaryLabel}
            {isLast ? <Play className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </footer>
      </div>
    </div>
  );
}
