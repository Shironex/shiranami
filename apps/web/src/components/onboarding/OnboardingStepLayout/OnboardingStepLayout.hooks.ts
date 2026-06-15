import type {
  IOnboardingStepLayoutProps,
  IOnboardingStepLayoutView,
} from './OnboardingStepLayout.types';

/**
 * The step layout is a pure two-pane presentation surface — it owns no state,
 * effects, or store reads. The hook simply normalizes the incoming props into
 * the view contract so the shell stays a thin, declarative renderer.
 */
export function useOnboardingStepLayout(
  props: IOnboardingStepLayoutProps
): IOnboardingStepLayoutView {
  return {
    kanji: props.kanji,
    stepMarker: props.stepMarker,
    headline: props.headline,
    description: props.description,
    children: props.children,
    headingId: props.headingId,
    headingRef: props.headingRef,
  };
}
