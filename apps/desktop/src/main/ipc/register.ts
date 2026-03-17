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
} from './';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerWindowHandlers(mainWindow);
  registerStoreHandlers();
  registerAppHandlers();
  registerDialogHandlers(mainWindow);
  registerLibraryHandlers();
}

export function cleanupIpcHandlers(): void {
  cleanupWindowHandlers();
  cleanupStoreHandlers();
  cleanupAppHandlers();
  cleanupDialogHandlers();
  cleanupLibraryHandlers();
}
