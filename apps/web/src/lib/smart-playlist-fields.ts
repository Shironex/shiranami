import type { SmartPlaylistField, SmartPlaylistOperator } from '@shiranami/contracts';

/** Value-input kind a field+operator pair expects in the rule builder. */
export type RuleValueKind = 'text' | 'number' | 'boolean' | 'range' | 'days';

/**
 * Which operators each field supports, mirroring what the backend
 * `ruleToCondition` translator actually handles. Keep in sync with
 * apps/desktop/src/main/ipc/database/smart-playlists.ts.
 */
export const FIELD_OPERATORS: Record<SmartPlaylistField, SmartPlaylistOperator[]> = {
  genre: ['is', 'isNot', 'contains'],
  artist: ['is', 'isNot', 'contains'],
  album: ['is', 'isNot', 'contains'],
  title: ['is', 'isNot', 'contains'],
  year: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  playCount: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  isFavorite: ['is', 'isNot'],
  dateAdded: ['inLastDays'],
};

export const SMART_PLAYLIST_FIELDS = Object.keys(FIELD_OPERATORS) as SmartPlaylistField[];

/** Resolve the value-input kind for a field+operator pair. */
export function valueKindFor(
  field: SmartPlaylistField,
  operator: SmartPlaylistOperator
): RuleValueKind {
  if (field === 'isFavorite') return 'boolean';
  if (field === 'dateAdded') return 'days';
  if (operator === 'between') return 'range';
  if (field === 'year' || field === 'playCount') return 'number';
  return 'text';
}

/** Default operator for a field (first supported one). */
export function defaultOperatorFor(field: SmartPlaylistField): SmartPlaylistOperator {
  return FIELD_OPERATORS[field][0];
}
