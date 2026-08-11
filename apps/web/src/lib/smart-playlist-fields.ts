import {
  SMART_PLAYLIST_FIELDS,
  type SmartPlaylistField,
  type SmartPlaylistOperator,
} from '@shiranami/contracts';
import { isTauri } from '@/lib/bridge/environment';

export { SMART_PLAYLIST_FIELDS };

/** Value-input kind a field+operator pair expects in the rule builder. */
export type RuleValueKind = 'text' | 'number' | 'boolean' | 'range' | 'days';

/**
 * Which operators each field supports, mirroring what the evaluator that owns
 * this build actually handles — `condition` in
 * `crates/shiranami-db/src/repo/smart_rules.rs`, the v2 (Rust) compiler. Keyed
 * by `SmartPlaylistField` (the contract tuple), so adding a field there forces
 * an entry here at compile time. The field/operator *names* themselves come
 * from @shiranami/contracts — only the per-field applicability lives here.
 *
 * # Why there is a second, narrower table below
 *
 * This file is shipped by **both** shells. `apps/desktop` (Electron) has no
 * renderer of its own: `apps/desktop/scripts/copy-renderer.mjs` copies
 * `apps/web/dist` into `apps/desktop/dist/renderer`, and the release workflow
 * builds `@shiranami/web` before packaging it. So every field offered here is
 * offered in the Electron build too, and its own translator
 * (`ruleToCondition` in `apps/desktop/src/main/ipc/database/smart-playlists.ts`)
 * covers only the vocabulary v1 shipped with.
 *
 * That translator **drops** a rule it cannot answer rather than failing it, and
 * a definition whose every rule drops evaluates with no `WHERE` at all — the
 * whole library. A user asking for "bpm greater than 120" would get every track
 * they own and no indication anything went wrong. `limit` and `orderBy` are the
 * same lie one layer up: v1's IPC input schema has no such keys, so a "top 25"
 * silently returns all matches.
 *
 * Hence {@link availableFields}, {@link availableOperatorsFor} and
 * {@link supportsResultShaping}: the picker offers what the *running* backend
 * can evaluate, not what the contract can express.
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

/**
 * What the v1 (Electron) evaluator can answer, transcribed from the `switch` in
 * `ruleToCondition`. A field absent from this map has no case there at all and
 * falls through to `default: return null`.
 *
 * Read it as a subset of {@link FIELD_OPERATORS}, never a superset: it exists
 * to *remove* choices from the picker on that build, so an entry claiming an
 * operator v1 lacks would reintroduce the very silent widening it prevents.
 *
 * `bpm` and `musicalKey` are missing because their columns are — migration
 * `0003_track_bpm_key.sql` added them to the v2 schema and v1's drizzle schema
 * cannot grow them without desyncing the frozen migration ledger that v2's
 * adoption path (`crates/shiranami-db/src/adopt/v1.rs`) embeds verbatim.
 * `lastPlayed`, `duration` and `loudnessLufs` have columns v1 could read; it
 * simply never learned to, and the commit that taught it was reverted with the
 * rest of the Electron mirror.
 */
const V1_FIELD_OPERATORS: {
  readonly [F in SmartPlaylistField]?: readonly SmartPlaylistOperator[];
} = {
  genre: ['is', 'isNot', 'contains'],
  artist: ['is', 'isNot', 'contains'],
  album: ['is', 'isNot', 'contains'],
  title: ['is', 'isNot', 'contains'],
  year: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  playCount: ['is', 'isNot', 'greaterThan', 'lessThan', 'between'],
  isFavorite: ['is', 'isNot'],
  dateAdded: ['inLastDays'],
};

/**
 * Whether the backend behind this renderer evaluates the whole contract.
 *
 * A function rather than a constant because `isTauri()` reads the window at
 * call time, and a module-level constant would freeze whatever the first import
 * saw — which in tests is whatever the previous test left behind.
 *
 * `isTauri()` directly rather than a capability lookup: the bridge manifest
 * (`@/lib/bridge/manifest`) maps channel *names* to implementations and both
 * shells implement every smart-playlist channel, so it cannot tell these two
 * evaluators apart. There is no finer seam to ask, and inventing one for a
 * single picker would cost more than it explains.
 */
function evaluatesFullVocabulary(): boolean {
  return isTauri();
}

/**
 * The fields this build can actually evaluate, in picker order.
 *
 * See {@link FIELD_OPERATORS} for why offering more than this is not a cosmetic
 * problem: on the Electron build the extra fields do not narrow the result,
 * they erase the filter.
 */
export function availableFields(): readonly SmartPlaylistField[] {
  if (evaluatesFullVocabulary()) return SMART_PLAYLIST_FIELDS;
  return SMART_PLAYLIST_FIELDS.filter(field => V1_FIELD_OPERATORS[field] !== undefined);
}

/** The operators this build can actually evaluate for a field. */
export function availableOperatorsFor(field: SmartPlaylistField): readonly SmartPlaylistOperator[] {
  if (evaluatesFullVocabulary()) return FIELD_OPERATORS[field];
  return V1_FIELD_OPERATORS[field] ?? FIELD_OPERATORS[field];
}

/**
 * Whether a definition's `limit` and `orderBy` survive the round trip.
 *
 * v1's `smartPlaylistCreateInput` has neither key, so both are stripped on the
 * way in and the saved playlist quietly returns every match in library order.
 * The editor hides the row rather than offering a control that does nothing.
 */
export function supportsResultShaping(): boolean {
  return evaluatesFullVocabulary();
}

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

/** Default operator for a field (first one this build supports). */
export function defaultOperatorFor(field: SmartPlaylistField): SmartPlaylistOperator {
  return availableOperatorsFor(field)[0];
}
