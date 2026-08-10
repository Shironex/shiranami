import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import {
  tracks,
  smartPlaylists,
  eq,
  ne,
  and,
  or,
  gt,
  lt,
  gte,
  lte,
  desc,
  sql,
  type NewSmartPlaylist,
  type SmartPlaylist as SmartPlaylistRow,
  type SQL,
} from '@shiranami/database';
import { getDatabase } from '@shiranami/database/client';
import { IPC_CHANNELS } from '@shiranami/contracts';
import type {
  SmartPlaylist,
  SmartPlaylistDefinition,
  SmartPlaylistField,
  SmartPlaylistOrderBy,
  SmartPlaylistRule,
  SmartPlaylistMatchType,
} from '@shiranami/contracts';
import { logger } from '../../app/logger';
import { handle } from '../with-ipc-handler';
import {
  smartPlaylistsGetAllArgs,
  smartPlaylistsGetArgs,
  smartPlaylistsCreateArgs,
  smartPlaylistsUpdateArgs,
  smartPlaylistsDeleteArgs,
  smartPlaylistsGetTracksArgs,
  smartPlaylistsPreviewArgs,
  storedRules,
  matchType,
} from '../schemas/db-smart-playlists';

const S = IPC_CHANNELS.db.smartPlaylists;

/**
 * Escape SQL LIKE wildcards (`%`, `_`) and the escape char itself in a
 * user-supplied value so a `contains` rule matches the literal text instead of
 * letting the user inject pattern metacharacters. Paired with `ESCAPE '\\'`.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}

/**
 * A rule naming a field this build has no column for.
 *
 * Distinct from `null` (a rule that is merely unusable — a blank operand, an
 * operator the field does not take) because the two must not be handled the
 * same way. An unusable rule is *dropped*, which widens the result; that is
 * v1's long-standing behaviour and safe, because the user can see the rule they
 * left half-filled. An *unevaluatable* one cannot be dropped: see
 * `buildSmartPlaylistWhere`.
 */
const UNSUPPORTED = Symbol('smart-playlist:unsupported-field');

/** What `ruleToCondition` can return: a condition, "drop me", or "I can't". */
type RuleCondition = SQL | undefined | null | typeof UNSUPPORTED;

/**
 * Plays that count as listening to a library track.
 *
 * `play_history` is not exclusively a library log — rows are also written for
 * other playback origins (internet radio among them), and those are not plays
 * of the track they may happen to be keyed to. Scoping to the `library` source
 * is an allowlist rather than a denylist on purpose: a source added later is
 * excluded until someone decides it should count, which is the direction that
 * fails safe. `apps/desktop/src/main/ipc/database/history.ts` already gates
 * scrobbling on the same `source === 'library'` test.
 */
const LIBRARY_PLAY = sql`play_history.source = 'library'`;

/**
 * `EXISTS`-shaped test for "this track has a library play since <cutoff>".
 *
 * A correlated `EXISTS` rather than a `MAX(played_at)` join because the query
 * it lands in selects whole `tracks` rows: a join would multiply them and force
 * a `GROUP BY` over every column, and `EXISTS` short-circuits on the first
 * matching history row instead of aggregating all of them.
 */
function playedSince(days: number): SQL {
  return sql`EXISTS (SELECT 1 FROM play_history WHERE play_history.track_id = ${tracks.id} AND ${LIBRARY_PLAY} AND play_history.played_at >= datetime('now', ${`-${days} days`}))`;
}

/**
 * Translate a single rule into a drizzle SQL condition over the `tracks` table.
 * Returns null when the rule cannot produce a meaningful condition (e.g. an
 * empty value), so the caller can skip it rather than match everything, and
 * `UNSUPPORTED` when the field has no column in this schema at all.
 */
function ruleToCondition(rule: SmartPlaylistRule): RuleCondition {
  const { field, operator, value, valueTo } = rule;

  switch (field) {
    case 'genre':
    case 'artist':
    case 'album':
    case 'title': {
      const column = tracks[field];
      if (!value.trim() && operator !== 'is' && operator !== 'isNot') return null;
      switch (operator) {
        case 'is':
          return eq(column, value);
        case 'isNot':
          return ne(column, value);
        case 'contains':
          // Escape LIKE wildcards in user input so they match literally.
          return sql`${column} LIKE ${`%${escapeLikePattern(value)}%`} ESCAPE '\\'`;
        default:
          return null;
      }
    }
    case 'musicalKey':
    case 'bpm':
      // No such column in this schema — see SMART_PLAYLIST_ANALYSIS_FIELDS.
      return UNSUPPORTED;
    case 'year':
    case 'playCount':
    case 'duration':
    case 'loudnessLufs': {
      // NULL operands (an untagged year, an unanalysed loudness) satisfy no
      // branch here, `isNot` included — SQL's three-valued logic, inherited
      // deliberately. See SmartPlaylistRule's contract doc.
      const column = tracks[field];
      if (!value.trim()) return null;
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      switch (operator) {
        case 'is':
          return eq(column, num);
        case 'isNot':
          return ne(column, num);
        case 'greaterThan':
          return gt(column, num);
        case 'lessThan':
          return lt(column, num);
        case 'between': {
          if (!valueTo || !valueTo.trim()) return null;
          const upper = Number(valueTo);
          if (!Number.isFinite(upper)) return null;
          return and(gte(column, num), lte(column, upper));
        }
        default:
          return null;
      }
    }
    case 'isFavorite': {
      // Stored as 0/1 integer; value is 'true'/'false'.
      const wanted = value === 'true' || value === '1';
      return operator === 'isNot' ? ne(tracks.isFavorite, wanted) : eq(tracks.isFavorite, wanted);
    }
    case 'dateAdded': {
      // Only the two day-count operators: created (or not) within the last N
      // days. `created_at` is NOT NULL, so the negation is a plain `<`.
      if (operator !== 'inLastDays' && operator !== 'notInLastDays') return null;
      const days = Number(value);
      if (!Number.isFinite(days) || days <= 0) return null;
      const cutoff = sql`datetime('now', ${`-${days} days`})`;
      return operator === 'inLastDays'
        ? gte(tracks.createdAt, cutoff)
        : lt(tracks.createdAt, cutoff);
    }
    case 'lastPlayed': {
      if (operator !== 'inLastDays' && operator !== 'notInLastDays') return null;
      const days = Number(value);
      if (!Number.isFinite(days) || days <= 0) return null;
      // `NOT EXISTS` is what makes "not played in 90 days" include tracks that
      // were never played at all — the whole point of the rule, and the case a
      // `MAX(played_at) < cutoff` comparison silently gets wrong, because a
      // NULL maximum compares to neither side.
      return operator === 'inLastDays' ? playedSince(days) : sql`NOT ${playedSince(days)}`;
    }
    default:
      return null;
  }
}

/** A condition that matches nothing, for a definition this build cannot honour. */
const MATCH_NOTHING = sql`1 = 0`;

/**
 * Fields in this definition that this build has no column for.
 *
 * Exported so the handler can name them in its warning rather than reporting an
 * empty playlist with no explanation.
 */
export function unevaluatableFields(definition: SmartPlaylistDefinition): SmartPlaylistField[] {
  const unsupported = definition.rules
    .filter(rule => ruleToCondition(rule) === UNSUPPORTED)
    .map(rule => rule.field);
  return [...new Set(unsupported)];
}

/**
 * Combine all rule conditions per the match type. Returns undefined when no
 * usable conditions exist — an "empty" rule set, which we treat as matching
 * everything (the whole library), mirroring how desktop music apps behave for
 * a smart playlist with no rules.
 *
 * A rule naming a field this schema lacks is the one case that does not follow
 * that rule. It compiles to `1 = 0` for the *whole* definition — under `any` as
 * much as under `all` — so an unanswerable playlist reads as empty rather than
 * as something wider than the user asked for. Failing open here would turn
 * "bpm between 100 and 130" into "every track in the library" and show it as
 * though it were the answer.
 */
export function buildSmartPlaylistWhere(definition: SmartPlaylistDefinition): SQL | undefined {
  const compiled = definition.rules.map(ruleToCondition);
  if (compiled.some(condition => condition === UNSUPPORTED)) return MATCH_NOTHING;

  const conditions = compiled.filter((c): c is SQL => c != null && c !== UNSUPPORTED);

  if (conditions.length === 0) return undefined;
  return definition.matchType === 'any' ? or(...conditions) : and(...conditions);
}

/**
 * The `tracks` column each sortable field names.
 *
 * Spelled out rather than indexed by field name because two of the mappings are
 * not identities: `dateAdded` is `created_at`, and `lastPlayed` has no column
 * at all (see `orderTerm`). `bpm` and `musicalKey` are absent for the reason
 * `SMART_PLAYLIST_ANALYSIS_FIELDS` gives.
 */
const ORDER_COLUMNS = {
  genre: tracks.genre,
  artist: tracks.artist,
  album: tracks.album,
  title: tracks.title,
  year: tracks.year,
  playCount: tracks.playCount,
  isFavorite: tracks.isFavorite,
  dateAdded: tracks.createdAt,
  duration: tracks.duration,
  loudnessLufs: tracks.loudnessLufs,
} as const satisfies Partial<Record<SmartPlaylistField, unknown>>;

/**
 * `ORDER BY` term for an explicit sort, or null when this build cannot sort on
 * the field and should fall back to the library order.
 *
 * `lastPlayed` has no column, so it sorts on a correlated `MAX(played_at)`
 * scoped exactly as the rule is. Its NULL — never played — sorts lowest in
 * SQLite and therefore first ascending, which is what "least recently played"
 * should mean.
 */
function orderTerm(orderBy: SmartPlaylistOrderBy): SQL | null {
  const direction = orderBy.direction === 'asc' ? sql`asc` : sql`desc`;

  if (orderBy.field === 'lastPlayed') {
    return sql`(SELECT MAX(play_history.played_at) FROM play_history WHERE play_history.track_id = ${tracks.id} AND ${LIBRARY_PLAY}) ${direction}`;
  }

  const column = ORDER_COLUMNS[orderBy.field as keyof typeof ORDER_COLUMNS];
  // Analysis fields have no column here; the rules naming them have already
  // made the definition select nothing, so the sort is moot either way.
  if (!column) return null;

  return sql`${column} ${direction}`;
}

/** Evaluate a definition against the tracks table and return matching rows. */
function evaluateDefinition(definition: SmartPlaylistDefinition) {
  const db = getDatabase();
  const where = buildSmartPlaylistWhere(definition);
  const query = db.select().from(tracks);

  const explicit = definition.orderBy ? orderTerm(definition.orderBy) : null;
  // `rowid asc` pins the order within a run of identical values — see
  // LIBRARY_TIE_BREAK in ./tracks.ts for why that is not optional. It stays the
  // final key under an explicit sort for the same reason: `play_count desc`
  // alone leaves every tie to the planner, so "top 25" would not be stable.
  const ordered = (where ? query.where(where) : query).orderBy(
    ...(explicit ? [explicit] : [desc(tracks.createdAt)]),
    sql`rowid asc`
  );

  const limit = definition.limit;
  return limit != null && Number.isFinite(limit) && limit > 0
    ? ordered.limit(Math.floor(limit)).all()
    : ordered.all();
}

/**
 * Serialize a definition's rule side for the `rules` column.
 *
 * Emits the bare array whenever there is no limit and no sort, so a definition
 * that uses neither is written exactly as older builds wrote it and stays
 * readable by one. Only a definition that needs the envelope gets it.
 */
function encodeRules(definition: {
  rules: SmartPlaylistRule[];
  limit?: number;
  orderBy?: SmartPlaylistOrderBy;
}): string {
  const { rules, limit, orderBy } = definition;
  if (limit == null && orderBy == null) return JSON.stringify(rules);
  return JSON.stringify({ rules, ...(limit != null && { limit }), ...(orderBy && { orderBy }) });
}

/** Parse a persisted row's JSON `rules` back into structured form. */
function rowToSmartPlaylist(row: SmartPlaylistRow): SmartPlaylist {
  let rules: SmartPlaylistRule[] = [];
  let limit: number | undefined;
  let orderBy: SmartPlaylistOrderBy | undefined;
  try {
    const parsed = JSON.parse(row.rules);
    const validated = storedRules.safeParse(parsed);
    if (validated.success) {
      // Either shape; the array is the legacy one and carries neither extra.
      if (Array.isArray(validated.data)) {
        rules = validated.data;
      } else {
        ({ rules, limit, orderBy } = validated.data);
      }
    } else {
      logger.warn(
        `[database] smart-playlist ${row.id} has invalid rules shape`,
        validated.error.issues
      );
    }
  } catch {
    logger.warn(`[database] smart-playlist ${row.id} has malformed rules JSON`);
  }

  const matchTypeResult = matchType.safeParse(row.matchType);
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    matchType: matchTypeResult.success ? matchTypeResult.data : 'all',
    rules,
    ...(limit != null && { limit }),
    ...(orderBy && { orderBy }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Evaluate a definition, naming any field this build cannot answer.
 *
 * `buildSmartPlaylistWhere` already makes such a definition select nothing; the
 * warning is what stops that empty result from being indistinguishable from a
 * filter that genuinely matched no tracks.
 */
function evaluateAndReport(id: string, definition: SmartPlaylistDefinition) {
  const unevaluatable = unevaluatableFields(definition);
  if (unevaluatable.length > 0) {
    logger.warn(
      `[database] smart-playlist ${id} uses rules this build cannot evaluate ` +
        `(${unevaluatable.join(', ')}); returning no tracks rather than a wider set`
    );
  }
  return evaluateDefinition(definition);
}

export function registerSmartPlaylistHandlers(): void {
  handle(
    S.getAll,
    async () => {
      const db = getDatabase();
      const rows = db.select().from(smartPlaylists).orderBy(desc(smartPlaylists.createdAt)).all();
      return rows.map(rowToSmartPlaylist);
    },
    { schema: smartPlaylistsGetAllArgs }
  );

  handle(
    S.get,
    async (_event, id: string) => {
      const db = getDatabase();
      const row = db.select().from(smartPlaylists).where(eq(smartPlaylists.id, id)).get();
      return row ? rowToSmartPlaylist(row) : null;
    },
    { schema: smartPlaylistsGetArgs }
  );

  handle(
    S.create,
    async (
      _event,
      data: {
        name: string;
        description?: string;
        matchType: SmartPlaylistMatchType;
        rules: SmartPlaylistRule[];
        limit?: number;
        orderBy?: SmartPlaylistOrderBy;
      }
    ) => {
      logger.info(`[database] smart-playlists:create: "${data.name}" (${data.rules.length} rules)`);
      const db = getDatabase();
      const row: NewSmartPlaylist = {
        id: crypto.randomUUID(),
        name: data.name,
        description: data.description,
        matchType: data.matchType,
        rules: encodeRules(data),
      };
      const created = db.insert(smartPlaylists).values(row).returning().get();
      return rowToSmartPlaylist(created);
    },
    { schema: smartPlaylistsCreateArgs }
  );

  handle(
    S.update,
    async (
      _event,
      id: string,
      data: {
        name?: string;
        description?: string;
        matchType?: SmartPlaylistMatchType;
        rules?: SmartPlaylistRule[];
        limit?: number;
        orderBy?: SmartPlaylistOrderBy;
      }
    ) => {
      const db = getDatabase();
      const patch: Partial<Omit<NewSmartPlaylist, 'updatedAt'>> & { updatedAt: SQL } = {
        updatedAt: sql`datetime('now')`,
      };
      if (data.name !== undefined) patch.name = data.name;
      if (data.description !== undefined) patch.description = data.description;
      if (data.matchType !== undefined) patch.matchType = data.matchType;

      // `rules`, `limit` and `orderBy` share one column, so they are written as
      // a unit. A patch carrying `rules` rewrites all three — which is how the
      // editor clears a limit, there being no other way to say "none" through
      // an optional field. A patch carrying only `limit`/`orderBy` keeps the
      // stored rules rather than wiping them.
      if (data.rules !== undefined) {
        patch.rules = encodeRules(data as { rules: SmartPlaylistRule[] } & typeof data);
      } else if (data.limit !== undefined || data.orderBy !== undefined) {
        const current = db.select().from(smartPlaylists).where(eq(smartPlaylists.id, id)).get();
        if (current) {
          const stored = rowToSmartPlaylist(current);
          patch.rules = encodeRules({
            rules: stored.rules,
            limit: data.limit ?? stored.limit,
            orderBy: data.orderBy ?? stored.orderBy,
          });
        }
      }

      const updated = db
        .update(smartPlaylists)
        .set(patch)
        .where(eq(smartPlaylists.id, id))
        .returning()
        .get();
      return updated ? rowToSmartPlaylist(updated) : null;
    },
    { schema: smartPlaylistsUpdateArgs }
  );

  handle(
    S.delete,
    async (_event, id: string) => {
      logger.info(`[database] smart-playlists:delete: ${id}`);
      const db = getDatabase();
      db.delete(smartPlaylists).where(eq(smartPlaylists.id, id)).run();
    },
    { schema: smartPlaylistsDeleteArgs }
  );

  handle(
    S.getTracks,
    async (_event, id: string) => {
      const db = getDatabase();
      const row = db.select().from(smartPlaylists).where(eq(smartPlaylists.id, id)).get();
      if (!row) return [];
      const saved = rowToSmartPlaylist(row);
      return evaluateAndReport(id, {
        matchType: saved.matchType,
        rules: saved.rules,
        limit: saved.limit,
        orderBy: saved.orderBy,
      });
    },
    { schema: smartPlaylistsGetTracksArgs }
  );

  handle(
    S.preview,
    async (_event, definition: SmartPlaylistDefinition) => {
      return evaluateAndReport('(preview)', definition);
    },
    { schema: smartPlaylistsPreviewArgs }
  );
}

export function cleanupSmartPlaylistHandlers(): void {
  ipcMain.removeHandler(S.getAll);
  ipcMain.removeHandler(S.get);
  ipcMain.removeHandler(S.create);
  ipcMain.removeHandler(S.update);
  ipcMain.removeHandler(S.delete);
  ipcMain.removeHandler(S.getTracks);
  ipcMain.removeHandler(S.preview);
}
