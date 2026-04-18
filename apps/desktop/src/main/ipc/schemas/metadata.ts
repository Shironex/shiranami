import { z } from 'zod';
import type { EnrichTrackInput } from '../metadata-enrich';

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);

/**
 * Mirrors `EnrichTrackInput` at `metadata-enrich.ts:7-17`. The compile-time
 * check below fails the build if the interface and this schema drift apart.
 */
export const enrichTrackInputSchema = z.object({
  id: uuid,
  filePath: nonEmpty,
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  albumArt: z.string().nullable(),
  genre: z.string(),
  year: z.number().int().nullable(),
  trackNumber: z.number().int().nullable(),
});

type _EnrichInputFromSchema = z.infer<typeof enrichTrackInputSchema>;
const _assertEnrichInput = (x: _EnrichInputFromSchema): EnrichTrackInput => x;
void _assertEnrichInput;

export const enrichOptionsSchema = z.object({
  writeToFile: z.boolean(),
  onlyMissing: z.boolean(),
});

export const metadataLookupArgs = z.tuple([z.string(), z.string()]);
export const metadataEnrichTracksArgs = z.tuple([
  z.array(enrichTrackInputSchema),
  enrichOptionsSchema,
]);
export const metadataEnrichCancelArgs = z.tuple([]);
