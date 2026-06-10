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
  SmartPlaylistRule,
  SmartPlaylistMatchType,
} from '@shiranami/contracts';
import { logger } from '../../logger';
import { handle } from '../with-ipc-handler';
import { z } from 'zod';
import {
  smartPlaylistsGetAllArgs,
  smartPlaylistsGetArgs,
  smartPlaylistsCreateArgs,
  smartPlaylistsUpdateArgs,
  smartPlaylistsDeleteArgs,
  smartPlaylistsGetTracksArgs,
  smartPlaylistsPreviewArgs,
  smartPlaylistRule,
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
 * Translate a single rule into a drizzle SQL condition over the `tracks` table.
 * Returns null when the rule cannot produce a meaningful condition (e.g. an
 * empty value), so the caller can skip it rather than match everything.
 */
function ruleToCondition(rule: SmartPlaylistRule): SQL | undefined | null {
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
    case 'year':
    case 'playCount': {
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
      // Only `inLastDays` is supported: created within the last N days.
      if (operator !== 'inLastDays') return null;
      const days = Number(value);
      if (!Number.isFinite(days) || days <= 0) return null;
      return gte(tracks.createdAt, sql`datetime('now', ${`-${days} days`})`);
    }
    default:
      return null;
  }
}

/**
 * Combine all rule conditions per the match type. Returns undefined when no
 * usable conditions exist — an "empty" rule set, which we treat as matching
 * everything (the whole library), mirroring how desktop music apps behave for
 * a smart playlist with no rules.
 */
export function buildSmartPlaylistWhere(definition: SmartPlaylistDefinition): SQL | undefined {
  const conditions = definition.rules.map(ruleToCondition).filter((c): c is SQL => c != null);

  if (conditions.length === 0) return undefined;
  return definition.matchType === 'any' ? or(...conditions) : and(...conditions);
}

/** Evaluate a definition against the tracks table and return matching rows. */
function evaluateDefinition(definition: SmartPlaylistDefinition) {
  const db = getDatabase();
  const where = buildSmartPlaylistWhere(definition);
  const query = db.select().from(tracks);
  return (where ? query.where(where) : query).orderBy(desc(tracks.createdAt)).all();
}

const rulesArraySchema = z.array(smartPlaylistRule);

/** Parse a persisted row's JSON `rules` back into structured form. */
function rowToSmartPlaylist(row: SmartPlaylistRow): SmartPlaylist {
  let rules: SmartPlaylistRule[] = [];
  try {
    const parsed = JSON.parse(row.rules);
    const validated = rulesArraySchema.safeParse(parsed);
    if (validated.success) {
      rules = validated.data;
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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
      }
    ) => {
      logger.info(`[database] smart-playlists:create: "${data.name}" (${data.rules.length} rules)`);
      const db = getDatabase();
      const row: NewSmartPlaylist = {
        id: crypto.randomUUID(),
        name: data.name,
        description: data.description,
        matchType: data.matchType,
        rules: JSON.stringify(data.rules),
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
      }
    ) => {
      const db = getDatabase();
      const patch: Partial<Omit<NewSmartPlaylist, 'updatedAt'>> & { updatedAt: SQL } = {
        updatedAt: sql`datetime('now')`,
      };
      if (data.name !== undefined) patch.name = data.name;
      if (data.description !== undefined) patch.description = data.description;
      if (data.matchType !== undefined) patch.matchType = data.matchType;
      if (data.rules !== undefined) patch.rules = JSON.stringify(data.rules);

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
      const definition = rowToSmartPlaylist(row);
      return evaluateDefinition({ matchType: definition.matchType, rules: definition.rules });
    },
    { schema: smartPlaylistsGetTracksArgs }
  );

  handle(
    S.preview,
    async (_event, definition: SmartPlaylistDefinition) => {
      return evaluateDefinition(definition);
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
