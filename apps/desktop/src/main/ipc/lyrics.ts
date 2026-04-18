import { ipcMain } from 'electron';
import { fetchLyrics, type LyricsResult } from '../lyrics-service';
import { handle } from './with-ipc-handler';
import { lyricsFetchArgs } from './schemas/lyrics';

export function registerLyricsHandlers(): void {
  handle(
    'lyrics:fetch',
    async (
      _event,
      title: string,
      artist: string,
      album?: string,
      duration?: number
    ): Promise<LyricsResult> => {
      return fetchLyrics(title, artist, album, duration);
    },
    { schema: lyricsFetchArgs },
  );
}

export function cleanupLyricsHandlers(): void {
  ipcMain.removeHandler('lyrics:fetch');
}
