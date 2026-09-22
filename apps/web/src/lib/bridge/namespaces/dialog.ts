import type { ElectronAPI } from '@/types/electron';
import type { FileFilter } from '@shiranami/contracts/bindings';
import { commands } from '../commands';

/**
 * v1 typed the argument as Electron's whole `OpenDialogOptions` while its zod
 * schema read only `filters`, so the renderer's declaration is `unknown`. The
 * cast reproduces that: the backend ignores unknown keys exactly as the
 * non-strict `z.object` did, so a caller still passing `properties` is dropped
 * rather than rejected.
 */
type OpenFileOptions = { filters?: FileFilter[] | null } | null;

export const dialogApi: ElectronAPI['dialog'] = {
  openDirectory: () => commands.dialogOpenDirectory(),
  openFile: options => commands.dialogOpenFile((options ?? null) as OpenFileOptions),
};
