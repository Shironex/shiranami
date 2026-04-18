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
 * `id` is omitted from the base — renderer-created tracks go through the
 * `add` handler which generates the UUID server-side. The compile-time check
 * below catches drift between this schema and NewTrack.
 */
export const newTrackSchema = z.object({
  filePath: nonEmpty,
  title: nonEmpty,
  artist: z.string().nullish(),
  album: z.string().nullish(),
  duration: z.number().nullish(),
  genre: z.string().nullish(),
  year: z.number().int().nullish(),
  trackNumber: z.number().int().nullish(),
  discNumber: z.number().int().nullish(),
  albumArt: z.string().nullish(),
  isFavorite: z.boolean().nullish(),
  playCount: z.number().int().nullish(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const updateTrackSchema = newTrackSchema.partial();

// Compile-time drift guard: forces a rebuild if NewTrack gains/loses fields.
// NewTrack includes `id`; we add it here purely for the assert.
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
