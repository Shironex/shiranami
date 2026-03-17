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
      duration?: number
    ): Promise<LyricsResult> => {
      return fetchLyrics(title, artist, album, duration);
    }
  );
}

export function cleanupLyricsHandlers(): void {
  ipcMain.removeHandler('lyrics:fetch');
}
