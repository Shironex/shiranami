import { z } from 'zod';

export const showInFolderArgs = z.tuple([z.string().min(1)]);
export const trashFileArgs = z.tuple([z.string().min(1)]);
