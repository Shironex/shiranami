import type { useTranslation } from 'react-i18next';
import type { DiscordMusicActivityType, DiscordPresenceTemplate } from '@shiranami/shared';

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** One selectable Discord activity type, with its localized label. */
export interface IDiscordActivityOption {
  /** The activity type value. */
  readonly value: DiscordMusicActivityType;
  /** Localized label for the activity type. */
  readonly label: string;
}

/** One template-variable hint chip (e.g. `{title}`). */
export interface IDiscordVariableHint {
  /** The variable token (e.g. `{title}`). */
  readonly key: string;
  /** Localized description of the variable. */
  readonly description: string;
}

export interface IDiscordTemplateEditorProps {
  /** Currently-selected activity type. */
  readonly selectedActivity: DiscordMusicActivityType;
  /** Change the selected activity type. */
  readonly onActivityChange: (activity: DiscordMusicActivityType) => void;
  /** The template for the selected activity. */
  readonly currentTemplate: DiscordPresenceTemplate;
  /** Update a single template field for an activity type. */
  readonly onTemplateChange: (
    type: DiscordMusicActivityType,
    field: keyof DiscordPresenceTemplate,
    value: string | boolean
  ) => void;
  /** Reset the selected activity's template to its default. */
  readonly onReset: () => void;
}

export interface IDiscordTemplateEditorView {
  /** Bound `settings`-namespace translator (the shell stays free of `useTranslation`). */
  readonly t: TranslateFn;
  /** Selectable activity-type options, pre-resolved with labels. */
  readonly activityOptions: readonly IDiscordActivityOption[];
  /** Template-variable hint chips, pre-resolved with descriptions. */
  readonly variableHints: readonly IDiscordVariableHint[];
}
