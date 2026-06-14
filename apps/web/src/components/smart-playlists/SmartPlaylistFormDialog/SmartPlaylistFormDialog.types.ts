import type {
  SmartPlaylist,
  SmartPlaylistField,
  SmartPlaylistMatchType,
  SmartPlaylistOperator,
  SmartPlaylistRule,
} from '@shiranami/contracts';
import type { useTranslation } from 'react-i18next';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

export interface ISmartPlaylistFormDialogProps {
  /** Dialog open state (controlled by the consuming view). */
  readonly open: boolean;
  /** Controls the dialog open state — closes on cancel and on a successful save. */
  readonly onOpenChange: (open: boolean) => void;
  /** Existing playlist to edit, or null/undefined to create a new one. */
  readonly playlist?: SmartPlaylist | null;
}

export interface ISmartPlaylistFormDialogView {
  /** Bound `smartPlaylists` namespace translator. */
  readonly t: TranslateFn;
  /** Bound `common` namespace translator. */
  readonly tCommon: TranslateFn;
  /** Editing an existing playlist (drives titles and the save vs. create label). */
  readonly isEdit: boolean;
  /** Current name value. */
  readonly name: string;
  /** Updates the name value. */
  readonly setName: (value: string) => void;
  /** Current match type ("all" / "any"). */
  readonly matchType: SmartPlaylistMatchType;
  /** Updates the match type. */
  readonly setMatchType: (value: SmartPlaylistMatchType) => void;
  /** Current rule rows in form order. */
  readonly rules: readonly SmartPlaylistRule[];
  /** True while a create/update mutation is in flight. */
  readonly isSaving: boolean;
  /** Whether the form can be saved (non-empty name and not already saving). */
  readonly canSave: boolean;
  /** Number of tracks the current (possibly unsaved) definition matches. */
  readonly previewCount: number;
  /** Changes a rule's field, resetting its operator/value to stay valid. */
  readonly onFieldChange: (index: number, field: SmartPlaylistField) => void;
  /** Sets a rule's operator. */
  readonly onOperatorChange: (index: number, operator: SmartPlaylistOperator) => void;
  /** Sets a rule's value. */
  readonly onValueChange: (index: number, value: string) => void;
  /** Sets a range rule's upper-bound value. */
  readonly onValueToChange: (index: number, valueTo: string) => void;
  /** Appends a fresh blank rule. */
  readonly onAddRule: () => void;
  /** Removes the rule at the given index (no-op when only one remains). */
  readonly onRemoveRule: (index: number) => void;
  /** Validates and persists the form, dismissing the dialog on success. */
  readonly onSave: () => void;
  /** Closes the dialog without saving. */
  readonly onCancel: () => void;
}
