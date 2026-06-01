import { z } from 'zod';

const nonEmpty = z.string().min(1);

export const downloaderCheckArgs = z.tuple([]);
export const downloaderGetDownloadLocationArgs = z.tuple([]);
// Accepts a directory path, null, or — as a convenience for the current
// renderer — an empty string (the handler already treats it as "reset to
// default" by deleting the key).
export const downloaderSetDownloadLocationArgs = z.tuple([z.union([z.string(), z.null()])]);
export const downloaderCheckDependenciesArgs = z.tuple([]);
export const downloaderGetCachedToolStatusArgs = z.tuple([]);
export const downloaderRefreshToolStatusArgs = z.tuple([]);
export const downloaderSearchArgs = z.tuple([nonEmpty]);
export const downloaderSuggestArgs = z.tuple([nonEmpty]);
export const downloaderDownloadArgs = z.tuple([
  z.object({
    url: nonEmpty,
    outputDir: z.string().optional(),
  }),
]);
export const downloaderInstallYtdlpArgs = z.tuple([]);
export const downloaderGetYtdlpPathArgs = z.tuple([]);
export const downloaderCheckFfmpegArgs = z.tuple([]);
export const downloaderInstallFfmpegArgs = z.tuple([]);
export const downloaderGetStreamUrlArgs = z.tuple([nonEmpty]);
export const downloaderInstallDependenciesArgs = z.tuple([]);

export const downloaderEnqueueArgs = z.tuple([
  z
    .object({
      url: nonEmpty,
      youtubeId: z.string().optional(),
      title: nonEmpty,
      batchId: z.string().optional(),
      batchIndex: z.number().int().nonnegative().optional(),
    })
    // `batchId` + `batchIndex` are a coupled pair: a playlist-import item carries
    // both, a single download carries neither. The importer treats a missing
    // `batchId` as the single-item path, so a half-specified pair would silently
    // misroute — reject it at the boundary.
    .refine(input => (input.batchId === undefined) === (input.batchIndex === undefined), {
      message: 'batchId and batchIndex must be provided together',
      path: ['batchIndex'],
    }),
]);
export const downloaderQueueCancelArgs = z.tuple([nonEmpty]); // item id
export const downloaderClearCompletedArgs = z.tuple([]);
export const downloaderGetQueueArgs = z.tuple([]);
