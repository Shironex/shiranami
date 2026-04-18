import { z } from 'zod';

export const windowMinimizeArgs = z.tuple([]);
export const windowMaximizeArgs = z.tuple([]);
export const windowCloseArgs = z.tuple([]);
export const windowIsMaximizedArgs = z.tuple([]);
export const windowSetAlwaysOnTopArgs = z.tuple([z.boolean()]);
export const windowSetCompactModeArgs = z.tuple([z.boolean()]);
