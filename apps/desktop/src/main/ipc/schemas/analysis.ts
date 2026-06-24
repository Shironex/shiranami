import { z } from 'zod';
import type { AnalysisAnalyzeInput } from '@shiranami/contracts';

const uuid = z.uuid();
const nonEmpty = z.string().min(1);

/**
 * Mirrors `AnalysisAnalyzeInput` from `@shiranami/contracts`. The compile-time
 * check below fails the build if the interface and this schema drift apart.
 */
export const analysisAnalyzeInputSchema = z.object({
  id: uuid,
  filePath: nonEmpty,
  title: z.string(),
});

type _AnalysisInputFromSchema = z.infer<typeof analysisAnalyzeInputSchema>;
const _assertAnalysisInput = (x: _AnalysisInputFromSchema): AnalysisAnalyzeInput => x;
void _assertAnalysisInput;

export const analysisAnalyzeArgs = z.tuple([z.array(analysisAnalyzeInputSchema)]);
export const analysisCancelArgs = z.tuple([]);
