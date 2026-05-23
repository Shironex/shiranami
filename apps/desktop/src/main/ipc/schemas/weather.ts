import { z } from 'zod';

/** `weather:geocode` — a single free-text city query. */
export const weatherGeocodeArgs = z.tuple([z.string().min(1).max(200)]);

/** `weather:get-current` — resolved coordinates from a prior geocode. */
export const weatherGetCurrentArgs = z.tuple([
  z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
]);
