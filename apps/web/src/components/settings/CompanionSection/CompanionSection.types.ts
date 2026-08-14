import type { useTranslation } from 'react-i18next';
import type { CompanionSpecies, CompanionStage } from '@/lib/companionMachine';
import type { CompanionAccessory } from '@/lib/companionAccessories';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One selectable resident in the species picker. */
export interface ICompanionSpeciesOption {
  readonly id: CompanionSpecies;
  /** Proper noun — never translated. */
  readonly name: string;
  /** The species kanji (潮 / 蛍). */
  readonly kanji: string;
  /** Localized epithet ("the tide-cat" / "the star jelly"). */
  readonly epithet: string;
  readonly selected: boolean;
}

/** One keepsake chip in the wardrobe picker. */
export interface ICompanionAccessoryOption {
  readonly id: CompanionAccessory;
  /** Localized keepsake name ("beret", "round glasses", …). */
  readonly label: string;
  /** Currently worn. */
  readonly worn: boolean;
  /** The pet has grown into this one; locked chips wait quietly. */
  readonly unlocked: boolean;
}

export interface ICompanionSectionView {
  readonly t: TranslateFn;
  /** Master toggle (`useInterfaceStore.companion`). */
  readonly enabled: boolean;
  readonly onToggleEnabled: (visible: boolean) => void;
  /** Both residents, previewed live at perch size. */
  readonly speciesOptions: readonly ICompanionSpeciesOption[];
  readonly onSelectSpecies: (species: CompanionSpecies) => void;
  /** "Keeps watch in Sanctuary" sub-toggle. */
  readonly keepsWatch: boolean;
  readonly onToggleKeepsWatch: (keepsWatch: boolean) => void;
  /** "Dresses for the weather" sub-toggle (weather fits + seasonal accents). */
  readonly dressForWeather: boolean;
  readonly onToggleDressForWeather: (dress: boolean) => void;
  /** The wardrobe row exists only when the ledger does — nothing to persist to otherwise. */
  readonly showKeepsakes: boolean;
  readonly accessoryOptions: readonly ICompanionAccessoryOption[];
  readonly onToggleAccessory: (id: CompanionAccessory) => void;
  /** Worn keepsakes, for the live previews. */
  readonly accessories: readonly CompanionAccessory[];
  /** The name row exists only when the ledger does, like the wardrobe. */
  readonly showNameRow: boolean;
  /** User-chosen name; null until the naming ceremony (or a rename here). */
  readonly name: string | null;
  readonly editingName: boolean;
  readonly nameDraft: string;
  readonly onNameDraftChange: (value: string) => void;
  readonly canSaveName: boolean;
  readonly onStartRename: () => void;
  readonly onCancelRename: () => void;
  readonly onSaveName: () => void;
  /** Current stage — the previews render the pet as it actually is today. */
  readonly stage: CompanionStage;
  /** Decorative motion allowed — previews sway only when the app itself may. */
  readonly motion: boolean;
  /**
   * The one place numbers exist: the prose stage line ("Shio · grown from
   * 112 hours of listening"), or null before the ledger has answered.
   */
  readonly stageLine: string | null;
}
