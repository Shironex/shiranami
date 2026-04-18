import { z } from 'zod';

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);

export const shareTrackArgs = z.tuple([uuid]);
export const sharePlaylistArgs = z.tuple([uuid]);
export const shareImportArgs = z.tuple([nonEmpty]);
export const shareCacheYoutubeIdArgs = z.tuple([uuid, nonEmpty]);
