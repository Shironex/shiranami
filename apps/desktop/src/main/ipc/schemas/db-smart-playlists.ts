import { z } from 'zod';
import { SMART_PLAYLIST_FIELDS, SMART_PLAYLIST_OPERATORS } from '@shiranami/contracts';

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);

/**
 * Zod mirrors for the `db:smart-playlists:*` IPC payloads. The rule shape
 * mirrors `SmartPlaylistDefinition` in @shiranami/contracts; the field/operator
 * enums are derived from the contract's tuples so they can never drift. Values
 * are kept as strings (the editor emits text) and coerced during evaluation.
 */
const ruleField = z.enum(SMART_PLAYLIST_FIELDS);

const ruleOperator = z.enum(SMART_PLAYLIST_OPERATORS);

export const smartPlaylistRule = z.object({
  field: ruleField,
  operator: ruleOperator,
  value: z.string(),
  valueTo: z.string().optional(),
});

export const matchType = z.enum(['all', 'any']);

export const smartPlaylistDefinition = z.object({
  matchType,
  rules: z.array(smartPlaylistRule),
});

export const smartPlaylistCreateInput = z.object({
  name: nonEmpty,
  description: z.string().optional(),
  matchType,
  rules: z.array(smartPlaylistRule),
});

export const smartPlaylistUpdateInput = z.object({
  name: nonEmpty.optional(),
  description: z.string().optional(),
  matchType: matchType.optional(),
  rules: z.array(smartPlaylistRule).optional(),
});

export const smartPlaylistsGetAllArgs = z.tuple([]);
export const smartPlaylistsGetArgs = z.tuple([uuid]);
export const smartPlaylistsCreateArgs = z.tuple([smartPlaylistCreateInput]);
export const smartPlaylistsUpdateArgs = z.tuple([uuid, smartPlaylistUpdateInput]);
export const smartPlaylistsDeleteArgs = z.tuple([uuid]);
export const smartPlaylistsGetTracksArgs = z.tuple([uuid]);
export const smartPlaylistsPreviewArgs = z.tuple([smartPlaylistDefinition]);
