/**
 * The two channels whose file dialog moved from the main process to the shim.
 *
 * v1's handlers opened `dialog.showSaveDialog` / `showOpenDialog` themselves and
 * took no argument; the Phase 14 ports take a path, because a Rust command that
 * opens a modal and then does a multi-second database operation behind it is two
 * responsibilities in one place. What the renderer sees is unchanged — still a
 * no-argument call resolving to `{ success, path?, error? }` — so the dialog has
 * to be re-opened from here, in the same order and with the same filters.
 *
 * # Why this is not a webview dialog capability
 *
 * Lane 6 granted the webview no dialog permissions at all: Rust-side calls
 * bypass the plugin's ACL, so a JS permission would buy nothing the backend
 * needs while handing the webview an unguarded picker. Both dialogs here go
 * through commands instead — the existing `dialog:open-file` for the import
 * half, and one new `dialog_save_file` for the export half, which had no v1
 * channel because v1 never exposed a save panel to the renderer.
 *
 * # Why the failure paths are caught rather than propagated
 *
 * v1 wrapped the whole operation in `try`/`catch` and returned
 * `{ success: false, error: message }`, so these two channels never rejected for
 * an operational failure — the renderer's `else if (result.error)` branch is
 * what shows the message, and its `catch` is a bare fallback that shows none.
 * v2 already answers most failures that way (`DbExportResult::failed`), but a
 * connection it cannot acquire still rejects, and that is precisely the class
 * v1 caught inside `exportDatabase`. Catching restores the message the user
 * would otherwise lose.
 *
 * Cancelling stays distinguishable from failing: `{ success: false }` with no
 * `error` is what the renderer reads as "the user changed their mind", and it
 * deliberately shows no toast for it.
 */

import type { DbBackupApi, DbExportResult, DbImportResult } from '@shiranami/contracts';
import { commands } from '../commands';
import { asContract } from '../wire';

/** v1's `defaultPath`: `shiranami-library-<ISO date>.db`. */
function suggestedFileName(): string {
  return `shiranami-library-${new Date().toISOString().slice(0, 10)}.db`;
}

/** The message v1's `catch` read off the error, for the same toast. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const dbBackupApi: DbBackupApi = {
  export: async (): Promise<DbExportResult> => {
    const destination = await commands.dialogSaveFile({
      title: 'Export Library Database',
      fileName: suggestedFileName(),
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (destination === null) return { success: false };

    try {
      return await asContract<DbExportResult>(commands.dbBackupExport(destination));
    } catch (error) {
      return { success: false, error: messageOf(error) };
    }
  },

  import: async (): Promise<DbImportResult> => {
    // The open panel already exists as a command, so the import half adds no
    // Rust surface. What it cannot carry is v1's `title: 'Import Library
    // Database'` — `dialog:open-file` never took one, and macOS has ignored an
    // NSOpenPanel title since 10.11, so the loss is one window caption on
    // Windows rather than anything a user acts on.
    const source = await commands.dialogOpenFile({
      filters: [
        { name: 'SQLite Database', extensions: ['db', 'sqlite'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (source === null) return { success: false };

    try {
      return await asContract<DbImportResult>(commands.dbBackupImport(source));
    } catch (error) {
      return { success: false, error: messageOf(error) };
    }
  },
};
