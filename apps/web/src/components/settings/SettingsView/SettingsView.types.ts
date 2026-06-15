import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { useTranslation } from 'react-i18next';

type ITranslateFn = ReturnType<typeof useTranslation>['t'];

export type ISettingsSection =
  | 'folders'
  | 'library'
  | 'enrich'
  | 'downloads'
  | 'playback'
  | 'equalizer'
  | 'visualizer'
  | 'lyrics'
  | 'compact'
  | 'appearance'
  | 'effects'
  | 'interface'
  | 'sidebar'
  | 'weather'
  | 'system'
  | 'scrobble'
  | 'discord'
  | 'updates'
  | 'privacy'
  | 'about'
  | 'support';

export type ISectionGroup = 'library' | 'playback' | 'appearance' | 'system';

/** A single navigable settings section entry. */
export interface ISettingsSectionEntry {
  readonly id: ISettingsSection;
  readonly labelKey: string;
  readonly subtitleKey: string;
  readonly Icon: LucideIcon;
  readonly group: ISectionGroup;
}

/** A nav group with its localized label and the sections it contains. */
export interface ISettingsNavGroup {
  readonly group: ISectionGroup;
  /** Localized group heading. */
  readonly label: string;
  /** Sections belonging to this group, in display order. */
  readonly items: ReadonlyArray<ISettingsSectionEntry>;
}

export interface ISettingsViewView {
  /** Bound `settings` namespace translator (the shell stays free of `useTranslation`). */
  readonly t: ITranslateFn;
  /** The currently-selected section. */
  readonly activeSection: ISettingsSection;
  /** The active section's entry (icon + label/subtitle keys). */
  readonly activeEntry: ISettingsSectionEntry;
  /** Resolved panel component for the active section. */
  readonly Panel: ComponentType;
  /** Nav groups (label + member sections) in display order. */
  readonly navGroups: ReadonlyArray<ISettingsNavGroup>;
  /** Localized aria-label for the section navigation. */
  readonly sectionsAriaLabel: string;
  /** Select a section by id. */
  readonly onSelectSection: (id: ISettingsSection) => void;
}
