/**
 * Smart (dynamic, rule-based) playlist contracts.
 *
 * A smart playlist persists only a rule definition; its tracks are evaluated
 * dynamically against the library at read time, so it auto-updates as the
 * library changes. The main process translates these rules into a single SQL
 * query (see the smart-playlists IPC handler).
 */

/** Track columns a rule can match against. */
export type SmartPlaylistField =
  | 'genre'
  | 'artist'
  | 'album'
  | 'title'
  | 'year'
  | 'playCount'
  | 'isFavorite'
  | 'dateAdded';

/** Comparison operators. Applicability depends on the field's type. */
export type SmartPlaylistOperator =
  | 'is'
  | 'isNot'
  | 'contains'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'inLastDays';

/**
 * A single rule. `value` / `valueTo` semantics depend on the operator:
 * - `between` uses both `value` (lower) and `valueTo` (upper).
 * - `inLastDays` uses `value` as a day count against `dateAdded`.
 * - `isFavorite` uses `value` as a boolean ('true'/'false').
 * - everything else compares `value` against the field.
 */
export interface SmartPlaylistRule {
  field: SmartPlaylistField;
  operator: SmartPlaylistOperator;
  value: string;
  valueTo?: string;
}

/** How multiple rules combine. */
export type SmartPlaylistMatchType = 'all' | 'any';

/** The persisted rule definition (stored JSON-serialized in `rules`). */
export interface SmartPlaylistDefinition {
  matchType: SmartPlaylistMatchType;
  rules: SmartPlaylistRule[];
}

/** A persisted smart playlist row (rules parsed back into structured form). */
export interface SmartPlaylist {
  id: string;
  name: string;
  description: string | null;
  matchType: SmartPlaylistMatchType;
  rules: SmartPlaylistRule[];
  createdAt: string;
  updatedAt: string;
}
