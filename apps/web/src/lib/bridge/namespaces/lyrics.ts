import type { LyricsApi } from '@shiranami/contracts';
import { commands } from '../commands';

export const lyricsApi: LyricsApi = {
  // Three optional positional arguments become three nullable ones: v1 sent
  // `undefined`, which Electron's structured clone carried as `undefined`, while
  // serde needs the absence stated.
  fetch: (title, artist, album, duration, filePath) =>
    commands.lyricsFetch(title, artist, album ?? null, duration ?? null, filePath ?? null),
};
