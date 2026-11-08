import { fetch as expoFetch } from 'expo/fetch';
import { SYNC_ROUTES } from '@shiranami/contracts/sync';
import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import type { SyncClient, SyncFetch, SyncResponse } from '@/lib/sync-client';
import type { PartialFile } from '@/lib/sync-download';
import type { SecretStore } from '@/lib/sync-peer';

/** The platform side of sync: files, the keystore and the network. */

function ensureDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create();
  return dir;
}

/** The app's tracks folder, the one imports are copied into. */
export function tracksDir(): Directory {
  return ensureDir('tracks');
}

/** The covers folder the scan writes to as well. */
export function artDir(): Directory {
  return ensureDir('art');
}

/** `art/<hash>.jpg`, the cover for a desktop artwork hash. */
export function artFile(hash: string): File {
  return new File(artDir(), `${hash.replace(/[^A-Za-z0-9_-]/g, '')}.jpg`);
}

/** Saves the cover for a desktop artwork hash, fetching it only when it is not there yet. */
export async function saveArt(
  client: SyncClient,
  hash: string,
  signal?: AbortSignal
): Promise<string> {
  const file = artFile(hash);
  if (file.exists) return file.uri;
  const path = SYNC_ROUTES.art(hash);
  await File.downloadFileAsync(client.url(path), file, {
    headers: { Authorization: client.authorization('GET', path) },
    idempotent: true,
    signal,
  });
  return file.uri;
}

/** The file name a synced track's audio gets: its content hash, like an import. */
export function audioFileName(
  desktopId: string,
  contentHash: string | null,
  format: string | null
): string {
  const ext = /^[a-z0-9]{1,5}$/i.test(format ?? '') ? (format as string).toLowerCase() : 'mp3';
  const hex = contentHash?.slice(contentHash.indexOf(':') + 1).replace(/[^A-Za-z0-9]/g, '');
  const base = hex || `desktop-${desktopId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  return `${base}.${ext}`;
}

/** A `.part` file in the tracks folder, appended through one open handle. */
export function partialFile(name: string): PartialFile {
  const dir = tracksDir();
  const part = new File(dir, `${name}.part`);
  let handle: FileHandle | null = null;
  const close = () => {
    handle?.close();
    handle = null;
  };
  return {
    size: () => (part.exists ? part.size : 0),
    append: bytes => {
      if (!handle) {
        if (!part.exists) part.create();
        handle = part.open(FileMode.Append);
      }
      handle.writeBytes(bytes);
    },
    reset: () => {
      close();
      if (part.exists) part.delete();
    },
    close,
    finish: async () => {
      close();
      const target = new File(dir, name);
      if (target.exists) target.delete();
      await part.move(target);
      return target.uri;
    },
  };
}

/** expo/fetch: OkHttp underneath, with a streaming body for audio. */
export const syncFetch: SyncFetch = async (url, init) =>
  (await expoFetch(url, init)) as unknown as SyncResponse;

/** The device secret in the Android keystore, readable only by this app on this phone. */
export const secureSecrets: SecretStore = {
  get: key => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: key => SecureStore.deleteItemAsync(key),
};
