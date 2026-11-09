import { fetch as expoFetch } from 'expo/fetch';
import type { SQLiteDatabase } from 'expo-sqlite';
import { File } from 'expo-file-system';
import { ApiError, errorFromStatus, getAudioLink } from '@/lib/api';
import { withLibraryLock } from '@/lib/library-scan';
import { artDir, partialFile } from '@/lib/sync-files';
import { SaveCancelledError, type SaveDeps } from '@/lib/youtube-save';

/** The platform side of saving a YouTube result: expo/fetch, the tracks and art folders. */
export function youtubeSaveDeps(db: SQLiteDatabase): SaveDeps {
  return {
    db,
    audioLink: getAudioLink,
    lock: withLibraryLock,
    download: async (url, name, { signal, onBytes, expectedSize }) => {
      const file = partialFile(name);
      // A part left by an earlier attempt is not resumed: links are re-signed
      // per attempt and a fresh start keeps this simple.
      file.reset();
      try {
        let response: Awaited<ReturnType<typeof expoFetch>>;
        try {
          response = await expoFetch(url, { signal });
        } catch (error) {
          if (signal?.aborted) throw new SaveCancelledError();
          throw new ApiError('unreachable', error instanceof Error ? error.message : 'unreachable');
        }
        if (!response.ok) {
          throw errorFromStatus(response.status, await response.text().catch(() => ''));
        }
        if (!response.body) throw new ApiError('server', 'the response has no body');
        const reader = response.body.getReader();
        let written = 0;
        try {
          for (;;) {
            if (signal?.aborted) throw new SaveCancelledError();
            const { done, value } = await reader.read();
            if (done) break;
            if (value?.length) {
              file.append(value);
              written += value.length;
              onBytes?.(written);
            }
          }
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          if (signal?.aborted) throw new SaveCancelledError();
          throw error;
        }
        if (expectedSize != null && written !== expectedSize) {
          throw new ApiError('server', `got ${written} of ${expectedSize} bytes`);
        }
        return { uri: await file.finish(), size: written };
      } catch (error) {
        file.reset();
        throw error;
      }
    },
    saveCover: async (url, name, signal) => {
      const file = new File(artDir(), name);
      if (file.exists) return file.uri;
      await File.downloadFileAsync(url, file, { idempotent: true, signal });
      return file.uri;
    },
  };
}
