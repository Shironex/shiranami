import { ipcMain } from 'electron';
import { fetchLyrics, type LyricsResult } from '../lyrics-service';

export function registerLyricsHandlers(): void {
  ipcMain.handle(
    'lyrics:fetch',
    async (
      _event,
      title: string,
      artist: string,
      album?: string,
      duration?: number,
      filePath?: string
    ): Promise<LyricsResult> => {
      return fetchLyrics(title, artist, album, duration, filePath);
    }
  );
}

export function cleanupLyricsHandlers(): void {
  ipcMain.removeHandler('lyrics:fetch');
}
