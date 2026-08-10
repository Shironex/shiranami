import {
  SMART_PLAYLIST_FIELDS,
  isAnalysisField,
  type SmartPlaylistField,
  type SmartPlaylistOperator,
} from '@shiranami/contracts';
import { isTauri } from '@/lib/bridge/environment';

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

/**
 * The fields this build can actually evaluate.
 *
 * `bpm` and `musicalKey` are columns of the v2 schema only, and an Electron
 * build that is handed a rule naming one returns *no* tracks rather than a
 * wider set (see `SMART_PLAYLIST_ANALYSIS_FIELDS` in @shiranami/contracts).
 * Offering them where they cannot be answered would let the editor author a
 * playlist that is empty by construction, so the picker hides them there.
 *
 * A function rather than a constant because `isTauri()` reads the window at
 * call time, and a module-level constant would freeze whatever the first
 * import saw — which in tests is whatever the previous test left behind.
 */
export function availableFields(): readonly SmartPlaylistField[] {
  if (isTauri()) return SMART_PLAYLIST_FIELDS;
  return SMART_PLAYLIST_FIELDS.filter(field => !isAnalysisField(field));
}

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
