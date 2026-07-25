export interface IOnboardingKanjiProps {
  /** Per-step glyph, e.g. 白波 / 蔵 / 夜 / 波. Not translated — it's brand art. */
  readonly glyph: string;
}

export interface IOnboardingKanjiView {
  /** Glyph painted as CSS generated content, never as a text node. */
  readonly glyph: string;
}
