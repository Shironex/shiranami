import type { IOnboardingKanjiProps, IOnboardingKanjiView } from './OnboardingKanji.types';

/**
 * The watermark is a pure decorative wash — no state, no effects, no store
 * reads. The hook normalizes its single input into the view contract so the
 * shell stays a thin, logic-free renderer.
 */
export function useOnboardingKanji({ glyph }: IOnboardingKanjiProps): IOnboardingKanjiView {
  return { glyph };
}
