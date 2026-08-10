import {
  SMART_PLAYLIST_FIELDS,
  type SmartPlaylistField,
  type SmartPlaylistOperator,
} from '@shiranami/contracts';

export { SMART_PLAYLIST_FIELDS };

/** Value-input kind a field+operator pair expects in the rule builder. */
export type RuleValueKind = 'text' | 'number' | 'boolean' | 'range' | 'days';

/**
 * Which operators each field supports, mirroring what the backend
 * `ruleToCondition` translator actually handles. Keyed by `SmartPlaylistField`
 * (the contract tuple), so adding a field there forces an entry here at compile
 * time. The field/operator *names* themselves come from @shiranami/contracts —
 * only the per-field applicability lives here.
 */
export const FIELD_OPERATORS: Record<SmartPlaylistField, SmartPlaylistOperator[]> = {
  genre: ['is', 'isNot', 'contains'],
  artist: ['is', 'isNot', 'contains'],
  album: ['is', 'isNot', 'contains'],
  title: ['is', 'isNot', 'contains'],
  musicalKey: ['is', 'isNot', 'contains'],
  year: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  playCount: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  bpm: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  duration: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  loudnessLufs: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  isFavorite: ['is', 'isNot'],
  dateAdded: ['inLastDays', 'notInLastDays'],
  lastPlayed: ['inLastDays', 'notInLastDays'],
};

/** Fields whose value input is numeric rather than free text. */
const NUMERIC_FIELDS: readonly SmartPlaylistField[] = [
  'year',
  'playCount',
  'bpm',
  'duration',
  'loudnessLufs',
];

/** Resolve the value-input kind for a field+operator pair. */
export function valueKindFor(
  field: SmartPlaylistField,
  operator: SmartPlaylistOperator
): RuleValueKind {
  if (field === 'isFavorite') return 'boolean';
  if (field === 'dateAdded' || field === 'lastPlayed') return 'days';
  if (operator === 'between') return 'range';
  if (NUMERIC_FIELDS.includes(field)) return 'number';
  return 'text';
}

/** Default operator for a field (first supported one). */
export function defaultOperatorFor(field: SmartPlaylistField): SmartPlaylistOperator {
  return FIELD_OPERATORS[field][0];
}
