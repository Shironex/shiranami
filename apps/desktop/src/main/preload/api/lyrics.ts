import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type LyricsResult } from '@shiranami/contracts';

const C = IPC_CHANNELS.lyrics;

export interface LyricsApi {
  fetch: (
    title: string,
    artist: string,
    album?: string,
    duration?: number,
    filePath?: string
  ) => Promise<LyricsResult>;
}

export const lyricsApi: LyricsApi = {
  fetch: (title, artist, album, duration, filePath) =>
    invoke(C.fetch, title, artist, album, duration, filePath),
};
