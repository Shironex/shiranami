import { z } from 'zod';
import type { NewRadioFavorite } from '@shiranami/database';

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);

/**
 * Zod mirror of the `radioFavorites` row.
 *
 * Backend-managed fields excluded: `id` is generated in the main process and
 * `createdAt` has a DB-level default — accepting either from the renderer
 * would let a tampered caller spoof identity or back-date rows.
 *
 * Drizzle nullability for the remaining columns:
 *   stationUuid/name/url/urlResolved — notNull, no default
 *   homepage/favicon/country/countryCode/language/codec/tags — nullable
 *   bitrate — nullable (integer)
 */
export const newRadioFavoriteInput = z.object({
  stationUuid: uuid,
  name: nonEmpty,
  url: nonEmpty,
  urlResolved: nonEmpty,
  homepage: z.string().nullish(),
  favicon: z.string().nullish(),
  country: z.string().nullish(),
  countryCode: z.string().nullish(),
  language: z.string().nullish(),
  codec: z.string().nullish(),
  bitrate: z.number().int().nullish(),
  tags: z.string().nullish(),
});

type _RadioInputFromSchema = z.infer<typeof newRadioFavoriteInput> & { id: string };
const _assertRadioInput = (x: _RadioInputFromSchema): NewRadioFavorite => x;
void _assertRadioInput;

export const radioFavoritesGetAllArgs = z.tuple([]);
export const radioFavoritesAddArgs = z.tuple([newRadioFavoriteInput]);
export const radioFavoritesRemoveArgs = z.tuple([uuid]);
export const radioFavoritesIsFavoriteArgs = z.tuple([uuid]);
