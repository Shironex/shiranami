import { z } from 'zod';

/**
 * `Electron.FileFilter` has shape `{ name: string; extensions: string[] }`.
 * Schema-ified manually since the Electron type is declaration-only.
 */
const fileFilterSchema = z.object({
  name: z.string(),
  extensions: z.array(z.string()),
});

export const dialogOpenDirectoryArgs = z.tuple([]);
export const dialogOpenFileArgs = z.tuple([
  z
    .object({
      filters: z.array(fileFilterSchema).optional(),
    })
    .optional(),
]);
