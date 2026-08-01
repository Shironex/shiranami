import { IPC_CHANNELS, type LibraryApi, type ScanProgress } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { scanProgress } from '../narrowers';

const C = IPC_CHANNELS.library;

export const libraryApi: LibraryApi = {
  parseMetadata: filePath => commands.libraryParseMetadata(filePath),
  scanFolder: dirPath => commands.libraryScanFolder(dirPath),
  scanFolderGrouped: dirPath => commands.libraryScanFolderGrouped(dirPath),
  validateFiles: filePaths => commands.libraryValidateFiles(filePaths),
  onScanProgress: callback =>
    subscribeChannel<ScanProgress>(
      C.scanProgress,
      events.libraryScanProgress,
      scanProgress,
      callback
    ),
  cancelScan: async () => {
    await commands.libraryScanCancel();
  },
};
