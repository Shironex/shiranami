import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Play, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useUIStore } from '@/stores/useUIStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import { Button } from '@/components/ui/button';
import { OnboardingScene } from './OnboardingScene';
import { OnboardingStepContext } from './stepContext';
import { useFocusTrap } from './useFocusTrap';
import { WelcomeStep } from './steps/WelcomeStep';
import { FoldersStep } from './steps/FoldersStep';
import { ToolsStep } from './steps/ToolsStep';
import { AppearanceStep } from './steps/AppearanceStep';
import { PlaybackStep } from './steps/PlaybackStep';
import { VisualizerStep } from './steps/VisualizerStep';
import { SummaryStep } from './steps/SummaryStep';

interface OnboardingWizardProps {
  onComplete: () => void;
}

type StepId =
  | 'welcome'
  | 'folders'
  | 'tools'
  | 'appearance'
  | 'playback'
  | 'visualizer'
  | 'summary';

interface StepDef {
  id: StepId;
  kanji: string;
  Component: () => React.ReactNode;
}

const STEPS: readonly StepDef[] = [
  { id: 'welcome', kanji: '白波', Component: WelcomeStep },
  { id: 'folders', kanji: '蔵', Component: FoldersStep },
  { id: 'tools', kanji: '取', Component: ToolsStep },
  { id: 'appearance', kanji: '夜', Component: AppearanceStep },
  { id: 'playback', kanji: '音', Component: PlaybackStep },
  { id: 'visualizer', kanji: '波', Component: VisualizerStep },
  { id: 'summary', kanji: '締', Component: SummaryStep },
];

const HEADING_ID = 'onboarding-step-heading';

/**
 * First-run setup wizard. Full-screen overlay shown once after the splash on a
 * user's first launch. Skippable steps; Skip == complete (we never show
 * onboarding twice). Lazy-loaded by App.tsx so it never ships to returning
 * users — hence the default export.
 */
export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation('onboarding');
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const completeOnboarding = useOnboardingStore(s => s.completeOnboarding);
  const { data: folders = [] } = useFoldersQuery();

  const [stepIndex, setStepIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(true);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Cached at mount — the OS preference doesn't change mid-wizard.
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );
  const disableMotion = reducedMotion || lowPerformanceMode;

  useFocusTrap(containerRef, !isExiting);

  // Entrance fade-in (skipped under reduced-motion / low-perf).
  useEffect(() => {
    if (disableMotion) {
      setIsEntering(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setIsEntering(false));
    return () => window.cancelAnimationFrame(id);
  }, [disableMotion]);

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const isFoldersStep = step.id === 'folders';
  const folderNudge = isFoldersStep && folders.length === 0;

  const finish = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    const done = () => {
      completeOnboarding();
      onComplete();
    };
    if (disableMotion) {
      done();
    } else {
      window.setTimeout(done, 520);
    }
  }, [isExiting, disableMotion, completeOnboarding, onComplete]);

  const goNext = useCallback(() => {
    if (isExiting) return;
    setStepIndex(i => (i >= STEPS.length - 1 ? i : i + 1));
  }, [isExiting]);

  const goBack = useCallback(() => {
    if (isExiting) return;
    setStepIndex(i => (i <= 0 ? i : i - 1));
  }, [isExiting]);

  const handlePrimary = useCallback(() => {
    if (isLast) {
      finish();
    } else {
      goNext();
    }
  }, [isLast, finish, goNext]);

  // Move focus to the step heading on each step change (a11y).
  useEffect(() => {
    headingRef.current?.focus();
  }, [stepIndex]);

  // Keyboard: → / Enter advance (or finish), ← back, Esc skips. Defers to
  // focused buttons/links/selects/radios so Enter on "Add folder"/Back/Skip
  // fires the control and arrows on a theme radio navigate the radiogroup.
  // Never hijacks while a text input is focused, a Radix dialog is open, a
  // slider has focus, or the wizard is in its exit animation.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isExiting) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isRangeInput = tag === 'INPUT' && (target as HTMLInputElement).type === 'range';
      if (target?.getAttribute('role') === 'slider' || isRangeInput) return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (target?.closest('button, a, select, [role="radio"]')) return;
        e.preventDefault();
        handlePrimary();
      } else if (e.key === 'ArrowLeft') {
        if (target?.closest('button, a, select, [role="radio"]')) return;
        e.preventDefault();
        if (!isFirst) goBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finish, handlePrimary, goBack, isFirst, isExiting]);

  const primaryLabel = isLast
    ? t('wizard.finish')
    : folderNudge
      ? t('wizard.skipForNow')
      : t('wizard.next');

  const StepComponent = step.Component;

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
        transition:
          isExiting || !disableMotion ? 'opacity 520ms ease-out, filter 520ms ease-out' : undefined,
        opacity: isExiting || isEntering ? 0 : 1,
        filter: isExiting && !disableMotion ? 'blur(8px)' : 'blur(0px)',
      }}
    >
      {/* Drag strip — keeps the frameless window movable */}
      {IS_ELECTRON && <div className="absolute inset-x-0 top-0 h-8 drag" />}

      {/* Rainy-window backdrop */}
      <OnboardingScene reducedMotion={disableMotion} />

      {/* Skip — always visible, top-right, never hover-gated */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={finish}
        className="no-drag absolute right-6 top-5 z-20 gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <SkipForward className="h-3.5 w-3.5" />
        {t('wizard.skip')}
      </Button>

      {/* Step content */}
      <div className="relative z-10 flex h-full flex-col px-6 pb-6 pt-16 md:px-12 md:pb-10 md:pt-16">
        <div className="flex min-h-0 flex-1 items-center">
          <StepLayoutHost
            stepId={step.id}
            kanji={step.kanji}
            headingId={HEADING_ID}
            headingRef={headingRef}
          >
            <StepComponent />
          </StepLayoutHost>
        </div>

        {/* Footer nav */}
        <footer className="no-drag relative z-10 mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {!isFirst && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={goBack}
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
            {STEPS.map((s, i) => {
              const active = i === stepIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-label={t('wizard.stepDotAria', { number: i + 1, id: s.id })}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => !isExiting && setStepIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active ? 'w-6 bg-primary' : 'w-1.5 bg-foreground/25 hover:bg-foreground/40'
                  )}
                />
              );
            })}
          </div>

          <Button type="button" onClick={handlePrimary} className="gap-1.5">
            {primaryLabel}
            {isLast ? <Play className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Bridges the wizard's per-step kanji/heading wiring into each step's own
 * OnboardingStepLayout. Steps consume `useOnboardingStepContext` to read the
 * shell-owned glyph + heading id, keeping the copy + control inside the step
 * file while the shell stays presentation-agnostic.
 */
function StepLayoutHost({
  stepId,
  kanji,
  headingId,
  headingRef,
  children,
}: {
  stepId: StepId;
  kanji: string;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ stepId, kanji, headingId, headingRef }),
    [stepId, kanji, headingId, headingRef]
  );
  return <OnboardingStepContext.Provider value={value}>{children}</OnboardingStepContext.Provider>;
}
