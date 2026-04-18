import { z } from 'zod';

const uuid = z.string().uuid();

export const foldersGetAllArgs = z.tuple([]);
export const foldersAddArgs = z.tuple([z.string().min(1)]);
export const foldersRemoveArgs = z.tuple([uuid]);
export const foldersUpdateScannedArgs = z.tuple([uuid]);
