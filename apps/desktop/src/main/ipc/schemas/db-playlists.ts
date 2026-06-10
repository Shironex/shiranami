import { z } from 'zod';

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);

/**
 * Hand-authored zod mirrors for the `db:playlists:*` IPC payloads. These are
 * the request shapes (renderer -> main), not row shapes — the playlists row
 * has its `id` generated in the main process.
 */
export const playlistCreateInput = z.object({
  name: nonEmpty,
  description: z.string().optional(),
  coverArt: z.string().optional(),
});

export const playlistCreateWithTracksInput = z.object({
  name: nonEmpty,
  description: z.string().optional(),
  trackIds: z.array(uuid),
});

export const playlistUpdateInput = z.object({
  name: nonEmpty.optional(),
  description: z.string().optional(),
  coverArt: z.string().optional(),
});

const playlistTrackPair = z.object({
  playlistId: uuid,
  trackId: uuid,
});

const playlistTracksBatch = z.object({
  playlistId: uuid,
  trackIds: z.array(uuid),
});

export const playlistsGetAllArgs = z.tuple([]);
export const playlistsGetArgs = z.tuple([uuid]);
export const playlistsCreateArgs = z.tuple([playlistCreateInput]);
export const playlistsCreateWithTracksArgs = z.tuple([playlistCreateWithTracksInput]);
export const playlistsUpdateArgs = z.tuple([uuid, playlistUpdateInput]);
export const playlistsDeleteArgs = z.tuple([uuid]);
export const playlistsGetTracksArgs = z.tuple([uuid]);
export const playlistsAddTrackArgs = z.tuple([playlistTrackPair]);
export const playlistsAddTracksArgs = z.tuple([playlistTracksBatch]);
export const playlistsRemoveTrackArgs = z.tuple([playlistTrackPair]);
export const playlistsRemoveTracksArgs = z.tuple([playlistTracksBatch]);
export const playlistsGetPlaylistsForTracksArgs = z.tuple([z.array(uuid)]);
export const playlistsReorderArgs = z.tuple([
  z.object({
    playlistId: uuid,
    trackIds: z.array(uuid),
  }),
]);
