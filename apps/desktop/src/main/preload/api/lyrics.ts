import { invoke } from '../context-bridge';
import { IPC_CHANNELS } from '@shiranami/contracts';

const C = IPC_CHANNELS.lyrics;

export interface LyricsApi {
  fetch: (
    title: string,
    artist: string,
    album?: string,
    duration?: number
  ) => Promise<{
    synced: Array<{ time: number; text: string }> | null;
    plain: string | null;
    source: 'lrclib' | 'cache' | null;
  }>;
}

export const lyricsApi: LyricsApi = {
  fetch: (title, artist, album, duration) => invoke(C.fetch, title, artist, album, duration),
};
