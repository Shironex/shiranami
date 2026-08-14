import type { useTranslation } from 'react-i18next';
import type { CompanionSpecies, CompanionStage } from '@/lib/companionMachine';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface INamingCeremonyView {
  readonly t: TranslateFn;
  /** The ceremony is due — first evolution reached (or first enable past it), still nameless. */
  readonly open: boolean;
  /** For the sprite in the middle of the moment. */
  readonly species: CompanionSpecies;
  readonly stage: CompanionStage;
  readonly motion: boolean;
  /** The species' proper name, offered as the placeholder. */
  readonly fallbackName: string;
  readonly draft: string;
  readonly onDraftChange: (value: string) => void;
  /** A trimmed non-empty draft. */
  readonly canConfirm: boolean;
  readonly onConfirm: () => void;
  /** "Maybe later" — the one-time moment passes quietly; Settings remains. */
  readonly onLater: () => void;
}
