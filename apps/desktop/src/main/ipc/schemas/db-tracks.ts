import { z } from 'zod';
import type { NewTrack } from '@shiranami/database';

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);

/**
 * Hand-authored zod mirror of `tracks` row shape (see
 * `packages/database/src/schema/tracks.ts`). Nullability follows the drizzle
 * column definitions: `title` and `filePath` are notNull with no default;
 * other string fields either have defaults or are nullable.
 *
 * Backend-managed fields (`id`, `isFavorite`, `playCount`, `createdAt`,
 * `updatedAt`) are excluded: `id` is generated in the main process, favorite
 * and play-count state have dedicated handlers (`toggle-favorite`,
 * `increment-play-count`), and the timestamp columns have DB-level defaults.
 * Accepting them here would let a tampered renderer spoof them on insert or
 * update.
 */
export const newTrackSchema = z.object({
  filePath: nonEmpty,
  title: nonEmpty,
  artist: z.string().nullish(),
  albumArtist: z.string().nullish(),
  album: z.string().nullish(),
  duration: z.number().nullish(),
  genre: z.string().nullish(),
  year: z.number().int().nullish(),
  trackNumber: z.number().int().nullish(),
  discNumber: z.number().int().nullish(),
  albumArt: z.string().nullish(),
});

export const updateTrackSchema = newTrackSchema.partial();

// Compile-time drift guard: forces a rebuild if NewTrack loses any of the
// user-writable fields above. Backend-managed fields are optional on NewTrack,
// so omitting them here keeps the assert valid.
type _NewTrackFromSchema = z.infer<typeof newTrackSchema> & { id: string };
const _assertNewTrack = (x: _NewTrackFromSchema): NewTrack => x;
void _assertNewTrack;

export const tracksGetAllArgs = z.tuple([]);
export const tracksAddArgs = z.tuple([newTrackSchema]);
export const tracksAddManyArgs = z.tuple([z.array(newTrackSchema)]);
export const tracksRemoveArgs = z.tuple([uuid]);
export const tracksRemoveManyArgs = z.tuple([z.array(uuid)]);
export const tracksUpdateArgs = z.tuple([uuid, updateTrackSchema]);
export const tracksUpdateManyArgs = z.tuple([
  z.array(z.object({ id: uuid, data: updateTrackSchema })),
]);
export const tracksToggleFavoriteArgs = z.tuple([uuid]);
export const tracksGetFavoritesArgs = z.tuple([]);
export const tracksIncrementPlayCountArgs = z.tuple([uuid]);
export const tracksExistsArgs = z.tuple([nonEmpty]);
export const tracksExistsManyArgs = z.tuple([z.array(nonEmpty)]);
