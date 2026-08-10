import { IPC_CHANNELS, type LyricsApi, type LyricsBatchProgress } from '@shiranami/contracts';
import { events } from '@shiranami/contracts/bindings';
import { commands } from '../commands';
import { subscribeChannel } from '../events';
import { lyricsSaveProgress } from '../narrowers';

const C = IPC_CHANNELS.lyrics;

export const lyricsApi: LyricsApi = {
  // Three optional positional arguments become three nullable ones: v1 sent
  // `undefined`, which Electron's structured clone carried as `undefined`, while
  // serde needs the absence stated.
  fetch: (title, artist, album, duration, filePath) =>
    commands.lyricsFetch(title, artist, album ?? null, duration ?? null, filePath ?? null),
  // The per-track hints need no such translation: they are `#[specta(optional)]`
  // fields, so an absent key deserializes to `None` and the JSON encoding drops
  // an `undefined` value on the way out.
  saveBatch: tracks => commands.lyricsSaveBatch(tracks),
  saveCancel: async () => {
    await commands.lyricsSaveCancel();
  },
  onSaveProgress: callback =>
    subscribeChannel<LyricsBatchProgress>(
      C.saveProgress,
      events.lyricsSaveProgress,
      lyricsSaveProgress,
      callback
    ),
};
