import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/useUIStore';
import { useOnboardingStore } from '@/stores/useOnboardingStore';
import { useFoldersQuery } from '@/hooks/queries/useFolders';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useFocusTrap } from '../useFocusTrap';
import { WelcomeStep } from '../steps/WelcomeStep';
import { FoldersStep } from '../steps/FoldersStep';
import { ToolsStep } from '../steps/ToolsStep';
import { AppearanceStep } from '../steps/AppearanceStep';
import { PlaybackStep } from '../steps/PlaybackStep';
import { VisualizerStep } from '../steps/VisualizerStep';
import { PrivacyStep } from '../steps/PrivacyStep';
import { SummaryStep } from '../steps/SummaryStep';
import type { OnboardingStepContextValue, OnboardingStepId } from '../stepContext';
import type {
  IOnboardingStep,
  IOnboardingWizardProps,
  IOnboardingWizardView,
} from './OnboardingWizard.types';

/** Stable id the wizard uses to label the dialog's current heading. */
export const ONBOARDING_HEADING_ID = 'onboarding-step-heading';

/** Exit fog-out duration, kept in sync with the container's transition timing. */
const EXIT_DURATION_MS = 520;

interface IStepDef {
  readonly id: OnboardingStepId;
  readonly kanji: string;
  readonly Component: () => React.ReactNode;
}

const STEPS: readonly IStepDef[] = [
  { id: 'welcome', kanji: '白波', Component: WelcomeStep },
  { id: 'folders', kanji: '蔵', Component: FoldersStep },
  { id: 'tools', kanji: '取', Component: ToolsStep },
  { id: 'appearance', kanji: '夜', Component: AppearanceStep },
  { id: 'playback', kanji: '音', Component: PlaybackStep },
  { id: 'visualizer', kanji: '波', Component: VisualizerStep },
  { id: 'privacy', kanji: '守', Component: PrivacyStep },
  { id: 'summary', kanji: '締', Component: SummaryStep },
];

export function useOnboardingWizard({ onComplete }: IOnboardingWizardProps): IOnboardingWizardView {
  const { t } = useTranslation('onboarding');
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);
  const completeOnboarding = useOnboardingStore(s => s.completeOnboarding);
  const { data: folders = [] } = useFoldersQuery();

  const [stepIndex, setStepIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [isEntering, setIsEntering] = useState(true);
  // True only when the wizard finishes via the final-step CTA (not skip/Esc);
  // drives the gentle note flourish. Never set under reduced-motion / low-perf.
  const [isCelebrating, setIsCelebrating] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Cached at mount — the OS preference doesn't change mid-wizard.
  const reducedMotion = useReducedMotion();
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
      window.setTimeout(done, EXIT_DURATION_MS);
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
      // Celebrate genuine completion; the flourish overlaps the exit fog-out.
      if (!disableMotion && !isExiting) setIsCelebrating(true);
      finish();
    } else {
      goNext();
    }
  }, [isLast, disableMotion, isExiting, finish, goNext]);

  const selectStep = useCallback(
    (index: number) => {
      if (isExiting) return;
      setStepIndex(index);
    },
    [isExiting]
  );

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

  const steps = useMemo<IOnboardingStep[]>(
    () =>
      STEPS.map((s, i) => ({
        id: s.id,
        kanji: s.kanji,
        Component: s.Component,
        dotLabel: t('wizard.stepDotAria', { number: i + 1, id: s.id }),
        isActive: i === stepIndex,
        onSelect: () => selectStep(i),
      })),
    [t, stepIndex, selectStep]
  );

  const primaryLabel = isLast
    ? t('wizard.finish')
    : folderNudge
      ? t('wizard.skipForNow')
      : t('wizard.next');

  const stepContextValue = useMemo<OnboardingStepContextValue>(
    () => ({ stepId: step.id, kanji: step.kanji, headingId: ONBOARDING_HEADING_ID, headingRef }),
    [step.id, step.kanji]
  );

  return {
    t,
    steps,
    currentStep: steps[stepIndex],
    stepContextValue,
    containerRef,
    isFirst,
    isLast,
    disableMotion,
    isExiting,
    isEntering,
    isCelebrating,
    primaryLabel,
    onPrimary: handlePrimary,
    onBack: goBack,
    onSkip: finish,
  };
}
