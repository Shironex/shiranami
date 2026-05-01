import { z } from 'zod';

export const windowMinimizeArgs = z.tuple([]);
export const windowMaximizeArgs = z.tuple([]);
export const windowCloseArgs = z.tuple([]);
export const windowIsMaximizedArgs = z.tuple([]);
export const windowSetAlwaysOnTopArgs = z.tuple([z.boolean()]);
export const windowCompactDimensions = z
  .object({
    width: z.number().int().min(200).max(1200),
    height: z.number().int().min(120).max(800),
  })
  .optional();
export const windowSetCompactModeArgs = z.tuple([z.boolean(), windowCompactDimensions]);
