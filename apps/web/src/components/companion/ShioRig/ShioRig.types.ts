import type { CompanionMode, CompanionStage } from '@/lib/companionMachine';

export interface IShioRigProps {
  /** Evolution stage index (0–4); reveals the additive layer groups. */
  readonly stage: CompanionStage;
  /** Active machine mode — drives the beat-riding group classes. */
  readonly mode: CompanionMode;
  /** Decorative motion allowed; false renders the static first frame. */
  readonly motion: boolean;
}

export interface IShioRigView {
  /** Unique mask id for the stage-V crescent halo. */
  readonly maskId: string;
  /** Beat-riding class for the wave-tail crest (undefined = static). */
  readonly beatClass: string | undefined;
  /** Drift class for the ground foam bubbles. */
  readonly bubClass: string | undefined;
  /** Occasional idle blink on the open eyes. */
  readonly blinkClass: string | undefined;
  /** Hatchling eyes are bigger — the endearingly unfinished look. */
  readonly eyeRy: number;
}
