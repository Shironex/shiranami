import {
  changelog,
  getLocalizedChangelog,
  kanjiForVersion,
  kindOfRelease,
  weekdayLabel,
  type ChangelogLanguage,
  type ReleaseKind,
} from '../../lib/changelog';
import { translations } from '../../lib/i18n';

export interface ChangelogRow {
  version: string;
  rawDate: string;
  date: string;
  weekday: string;
  kanji: string;
  title: string;
  description: string;
  kind: ReleaseKind;
  kindLabel: string;
  categories: Array<{
    label: string;
    entries: string[];
  }>;
  entriesCount: number;
}

export interface ChangelogCopy {
  filters: Record<'all' | ReleaseKind, string>;
  searchPlaceholder: string;
  entryNumber: string; // "Entry №"
  itemsSingular: string;
  itemsPlural: string;
  empty: string;
  emptyHint: string;
  rowVersion: string;
  rowKind: string;
  rowEntries: string;
  rowSections: string;
  jumpTitle: string;
  stamp: string;
  quietNote: string;
}

export const RELEASE_KINDS: ReleaseKind[] = ['feature', 'fix', 'perf', 'polish'];

export function buildRows(language: ChangelogLanguage): ChangelogRow[] {
  const d = translations[language];
  return getLocalizedChangelog(language).map((release, index) => {
    const raw = changelog[index];
    const kind = kindOfRelease(release);
    return {
      version: release.version,
      rawDate: raw.date,
      date: release.date,
      weekday: weekdayLabel(raw.date, language),
      kanji: kanjiForVersion(release.version),
      title: release.title,
      description: release.description,
      kind,
      kindLabel: d[`changelog.kind.${kind}`],
      categories: release.categories,
      entriesCount: release.categories.reduce((acc, c) => acc + c.entries.length, 0),
    };
  });
}

export function buildCopy(language: ChangelogLanguage): ChangelogCopy {
  const d = translations[language];
  return {
    filters: {
      all: d['changelog.filter.all'],
      feature: d['changelog.filter.feature'],
      fix: d['changelog.filter.fix'],
      perf: d['changelog.filter.perf'],
      polish: d['changelog.filter.polish'],
    },
    searchPlaceholder: d['changelog.search.placeholder'],
    entryNumber: d['changelog.entryNumber'],
    itemsSingular: d['changelog.items.one'],
    itemsPlural: d['changelog.items.many'],
    empty: d['changelog.empty'],
    emptyHint: d['changelog.empty.hint'],
    rowVersion: d['changelog.row.version'],
    rowKind: d['changelog.row.kind'],
    rowEntries: d['changelog.row.entries'],
    rowSections: d['changelog.row.sections'],
    jumpTitle: d['changelog.jump.title'],
    stamp: d['changelog.stamp'],
    quietNote: d['changelog.quietNote'],
  };
}
