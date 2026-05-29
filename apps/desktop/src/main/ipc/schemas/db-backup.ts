import { z } from 'zod';

// Both backup operations take no renderer-supplied arguments — the file path is
// chosen via a native dialog in the main process, never passed from the
// renderer. Validate the empty argument tuple to match the handler style.
export const dbBackupExportArgs = z.tuple([]);
export const dbBackupImportArgs = z.tuple([]);
