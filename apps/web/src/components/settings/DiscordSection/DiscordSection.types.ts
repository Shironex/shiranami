import type { useTranslation } from 'react-i18next';
import type {
  DiscordRpcSettings,
  DiscordMusicActivityType,
  DiscordPresenceTemplate,
} from '@shiranami/shared';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One activity-type chip in the preview selector row. */
export interface IDiscordActivityChip {
  /** The activity type value. */
  readonly value: DiscordMusicActivityType;
  /** Localized label for the activity type. */
  readonly label: string;
  /** Whether this chip is the selected activity. */
  readonly isActive: boolean;
}

export interface IDiscordSectionView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Loaded Discord RPC settings draft, or null while loading (bar is hidden). */
  readonly settings: DiscordRpcSettings | null;
  /** Whether the inline "Saved" confirmation is showing. */
  readonly saved: boolean;
  /** Whether the save mutation is in flight (disables the button). */
  readonly isSaving: boolean;
  /** Currently-selected activity type for the preview/editor. */
  readonly selectedActivity: DiscordMusicActivityType;
  /** Activity-type chips for the preview selector, pre-resolved with active flags. */
  readonly activityChips: readonly IDiscordActivityChip[];
  /** Whether the custom-template editor card is shown. */
  readonly showCustomTemplateEditing: boolean;
  /** The template for the selected activity. */
  readonly currentTemplate: DiscordPresenceTemplate;
  /** Pre-substituted preview "details" line for the selected activity. */
  readonly previewDetails: string;
  /** Pre-substituted preview "state" line for the selected activity. */
  readonly previewState: string;
  /** Update a single top-level settings field. */
  readonly onUpdateField: <K extends keyof DiscordRpcSettings>(
    key: K,
    value: DiscordRpcSettings[K]
  ) => void;
  /** Update a single template field for an activity type. */
  readonly onUpdateTemplate: (
    type: DiscordMusicActivityType,
    field: keyof DiscordPresenceTemplate,
    value: string | boolean
  ) => void;
  /** Select the active activity type for the preview/editor. */
  readonly onSelectActivity: (activity: DiscordMusicActivityType) => void;
  /** Persist the current settings draft. */
  readonly onSave: () => void;
  /** Reset the selected activity's template to its default. */
  readonly onResetTemplate: () => void;
}
