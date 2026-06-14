import { z } from 'zod';

/** `waveform:get-peaks` takes a single non-empty file path. */
export const waveformGetPeaksArgs = z.tuple([z.string().min(1)]);
