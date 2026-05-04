import { z } from 'zod';

const nonEmptyPath = z.string().min(1);

export const parseMetadataArgs = z.tuple([nonEmptyPath]);
export const scanFolderArgs = z.tuple([nonEmptyPath]);
export const scanFolderGroupedArgs = z.tuple([nonEmptyPath]);
export const validateFilesArgs = z.tuple([z.array(nonEmptyPath)]);
export const scanCancelArgs = z.tuple([]);
