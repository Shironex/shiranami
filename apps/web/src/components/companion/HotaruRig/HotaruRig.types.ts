import type { CompanionMode, CompanionStage } from '@/lib/companionMachine';
import type { CompanionOutfit } from '@/lib/companionOutfit';

export interface IHotaruRigProps {
  /** Evolution stage index (0–4); reveals the additive layer groups. */
  readonly stage: CompanionStage;
  /** Active machine mode — drives the beat-riding group classes. */
  readonly mode: CompanionMode;
  /** Decorative motion allowed; false renders the static first frame. */
  readonly motion: boolean;
  /**
   * Weather/seasonal accessory layer. Null/omitted mounts nothing — the bare
   * rig stays byte-identical to the outfit-less render.
   */
  readonly outfit?: CompanionOutfit | null;
}

export interface IHotaruRigView {
  /** Unique mask id for the stage-V crescent. */
  readonly maskId: string;
  /** Beat-riding class for the tendrils and glow-motes (undefined = static). */
  readonly beatClass: string | undefined;
  /** Drift class for the ambient foam bubbles. */
  readonly bubClass: string | undefined;
  /** Occasional idle blink on the open eyes. */
  readonly blinkClass: string | undefined;
  /** Hatchling eyes are bigger — the endearingly unfinished look. */
  readonly eyeRy: number;
  /** Soft pulse for the lantern-glow outfit (undefined = static glow). */
  readonly lanternClass: string | undefined;
}
