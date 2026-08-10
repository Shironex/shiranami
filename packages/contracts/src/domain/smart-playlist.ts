/**
 * Smart (dynamic, rule-based) playlist contracts.
 *
 * A smart playlist persists only a rule definition; its tracks are evaluated
 * dynamically against the library at read time, so it auto-updates as the
 * library changes. The main process translates these rules into a single SQL
 * query (see the smart-playlists IPC handler).
 */

/**
 * Track columns a rule can match against. This tuple is the single source of
 * truth: the `SmartPlaylistField` union, the IPC zod enum, and the renderer's
 * per-field operator map are all derived from it, so adding a field here is the
 * only edit needed to thread it through every layer.
 */
export const SMART_PLAYLIST_FIELDS = [
  'genre',
  'artist',
  'album',
  'title',
  'year',
  'playCount',
  'isFavorite',
  'dateAdded',
  'lastPlayed',
  'bpm',
  'duration',
  'loudnessLufs',
  'musicalKey',
] as const;

/** Track columns a rule can match against. */
export type SmartPlaylistField = (typeof SMART_PLAYLIST_FIELDS)[number];

/**
 * Comparison operators. Applicability depends on the field's type. Source of
 * truth for the `SmartPlaylistOperator` union and the IPC zod enum.
 */
export const SMART_PLAYLIST_OPERATORS = [
  'is',
  'isNot',
  'contains',
  'greaterThan',
  'lessThan',
  'between',
  'inLastDays',
  'notInLastDays',
] as const;

/** Comparison operators. Applicability depends on the field's type. */
export type SmartPlaylistOperator = (typeof SMART_PLAYLIST_OPERATORS)[number];

/**
 * A single rule. `value` / `valueTo` semantics depend on the operator:
 * - `between` uses both `value` (lower) and `valueTo` (upper).
 * - `inLastDays` / `notInLastDays` use `value` as a day count, against
 *   `dateAdded` or `lastPlayed`.
 * - `isFavorite` uses `value` as a boolean ('true'/'false').
 * - everything else compares `value` against the field.
 *
 * # How NULL behaves
 *
 * `bpm`, `duration`, `loudnessLufs`, `year` and `musicalKey` are all nullable —
 * for the analysis columns, NULL means "not analysed yet" (or "analysed and
 * nothing detectable"; the schema collapses the two). SQL three-valued logic
 * decides what that means and every evaluator inherits it unchanged: a NULL
 * operand satisfies **no** comparison, `isNot` included. An unanalysed track is
 * therefore excluded by "bpm is not 120" just as it is by "bpm is 120". This is
 * the pre-existing behaviour of `year`, kept rather than special-cased: the
 * alternative — treating "unknown" as "does not equal" — makes an `all`
 * definition silently fill up with unanalysed tracks.
 *
 * `lastPlayed` is the deliberate exception, because its NULL is *meaningful*
 * rather than missing: a track with no play history has never been played, so
 * it satisfies `notInLastDays` for any day count. See the evaluators.
 */
export interface SmartPlaylistRule {
  field: SmartPlaylistField;
  operator: SmartPlaylistOperator;
  value: string;
  valueTo?: string;
}

/** How multiple rules combine. */
export type SmartPlaylistMatchType = 'all' | 'any';

/** Sort directions an `orderBy` clause can take. */
export const SMART_PLAYLIST_SORT_DIRECTIONS = ['asc', 'desc'] as const;

/** Sort direction for an `orderBy` clause. */
export type SmartPlaylistSortDirection = (typeof SMART_PLAYLIST_SORT_DIRECTIONS)[number];

/**
 * An explicit sort for a definition's results, replacing the default library
 * order (newest first). Paired with `limit` this is what makes "top 25 most
 * played" and "50 least recently played" expressible.
 *
 * Ordering by `lastPlayed` sorts on the most recent play, and never-played
 * tracks sort as NULL — lowest, so they come *first* ascending. That is the
 * semantically right end: a track never played is the least recently played
 * thing in the library.
 */
export interface SmartPlaylistOrderBy {
  field: SmartPlaylistField;
  direction: SmartPlaylistSortDirection;
}

/**
 * The persisted rule definition (stored JSON-serialized in `rules`).
 *
 * # Storage shape, and why there is no migration
 *
 * The `rules` column has always held a JSON *array* of rules, and rows written
 * by builds older than `limit`/`orderBy` still do. Rather than add columns —
 * which the frozen v1 migration ledger makes expensive — the column now accepts
 * two shapes and readers accept both:
 *
 * - a bare array, `[...]` — the legacy shape, no limit and no sort;
 * - an envelope, `{ "rules": [...], "limit": 25, "orderBy": {...} }`.
 *
 * Writers emit the envelope **only** when a limit or a sort is actually set, so
 * a definition that uses neither round-trips byte-identically to what a v1
 * build would have written and stays readable by one.
 */
export interface SmartPlaylistDefinition {
  matchType: SmartPlaylistMatchType;
  rules: SmartPlaylistRule[];
  /** Maximum tracks to return. Omitted or non-positive means unbounded. */
  limit?: number;
  /** Explicit sort, replacing the default library order. */
  orderBy?: SmartPlaylistOrderBy;
}

/** A persisted smart playlist row (rules parsed back into structured form). */
export interface SmartPlaylist {
  id: string;
  name: string;
  description: string | null;
  matchType: SmartPlaylistMatchType;
  rules: SmartPlaylistRule[];
  limit?: number;
  orderBy?: SmartPlaylistOrderBy;
  createdAt: string;
  updatedAt: string;
}
