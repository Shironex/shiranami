import { z } from 'zod';

export const lyricsFetchArgs = z.tuple([
  z.string().min(1),
  z.string().min(1),
  z.string().optional(),
  z.number().optional(),
  z.string().min(1).optional(),
]);
