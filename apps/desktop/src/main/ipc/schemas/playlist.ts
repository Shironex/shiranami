import { z } from 'zod';

export const playlistExtractArgs = z.tuple([z.string().min(1)]);
export const playlistCancelArgs = z.tuple([]);
