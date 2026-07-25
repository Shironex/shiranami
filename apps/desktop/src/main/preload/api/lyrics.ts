import { invoke } from '../context-bridge';
import { IPC_CHANNELS, type LyricsApi } from '@shiranami/contracts';

const C = IPC_CHANNELS.lyrics;

export type { LyricsApi };

export const lyricsApi: LyricsApi = {
  fetch: (title, artist, album, duration, filePath) =>
    invoke(C.fetch, title, artist, album, duration, filePath),
};
