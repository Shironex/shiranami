import { z } from 'zod';
import type { LoudnessAnalyzeInput } from '@shiranami/contracts';

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);

/**
 * Mirrors `LoudnessAnalyzeInput` from `@shiranami/contracts`. The compile-time
 * check below fails the build if the interface and this schema drift apart.
 */
export const loudnessAnalyzeInputSchema = z.object({
  id: uuid,
  filePath: nonEmpty,
  title: z.string(),
});

type _LoudnessInputFromSchema = z.infer<typeof loudnessAnalyzeInputSchema>;
const _assertLoudnessInput = (x: _LoudnessInputFromSchema): LoudnessAnalyzeInput => x;
void _assertLoudnessInput;

export const loudnessAnalyzeArgs = z.tuple([z.array(loudnessAnalyzeInputSchema)]);
export const loudnessCancelArgs = z.tuple([]);
