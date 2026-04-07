import { BrowserWindow } from 'electron';
import {
  registerWindowHandlers,
  cleanupWindowHandlers,
  registerStoreHandlers,
  cleanupStoreHandlers,
  registerAppHandlers,
  cleanupAppHandlers,
  registerDialogHandlers,
  cleanupDialogHandlers,
  registerLibraryHandlers,
  cleanupLibraryHandlers,
  registerMediaHandlers,
  cleanupMediaHandlers,
  registerLyricsHandlers,
  cleanupLyricsHandlers,
  registerDatabaseHandlers,
  cleanupDatabaseHandlers,
  registerShellHandlers,
  cleanupShellHandlers,
  registerDownloaderHandlers,
  cleanupDownloaderHandlers,
  registerUpdaterHandlers,
  cleanupUpdaterHandlers,
  registerRadioHandlers,
  cleanupRadioHandlers,
  registerPlaylistHandlers,
  cleanupPlaylistHandlers,
  registerShareHandlers,
  cleanupShareHandlers,
  registerMetadataEnrichHandlers,
  cleanupMetadataEnrichHandlers,
} from './';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerWindowHandlers(mainWindow);
  registerStoreHandlers();
  registerAppHandlers();
  registerDialogHandlers(mainWindow);
  registerLibraryHandlers();
  registerMediaHandlers(mainWindow);
  registerLyricsHandlers();
  registerDatabaseHandlers();
  registerShellHandlers();
  registerDownloaderHandlers();
  registerUpdaterHandlers();
  registerRadioHandlers();
  registerPlaylistHandlers();
  registerShareHandlers();
  registerMetadataEnrichHandlers(mainWindow);
}

export function cleanupIpcHandlers(): void {
  cleanupWindowHandlers();
  cleanupStoreHandlers();
  cleanupAppHandlers();
  cleanupDialogHandlers();
  cleanupLibraryHandlers();
  cleanupMediaHandlers();
  cleanupLyricsHandlers();
  cleanupDatabaseHandlers();
  cleanupShellHandlers();
  cleanupDownloaderHandlers();
  cleanupUpdaterHandlers();
  cleanupRadioHandlers();
  cleanupPlaylistHandlers();
  cleanupShareHandlers();
  cleanupMetadataEnrichHandlers();
}
