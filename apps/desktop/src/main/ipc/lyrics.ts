import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@shiranami/contracts';
import { fetchLyrics, type LyricsResult } from '../lyrics-service';
import { handle } from './with-ipc-handler';
import { lyricsFetchArgs } from './schemas/lyrics';

const C = IPC_CHANNELS.lyrics;

export function registerLyricsHandlers(): void {
  handle(
    C.fetch,
    async (
      _event,
      title: string,
      artist: string,
      album?: string,
      duration?: number
    ): Promise<LyricsResult> => {
      return fetchLyrics(title, artist, album, duration);
    },
    { schema: lyricsFetchArgs }
  );
}

export function cleanupLyricsHandlers(): void {
  ipcMain.removeHandler(C.fetch);
}
