import { Directory, File, Paths } from 'expo-file-system';
import { AudioLibrary } from '@/modules/audio-library';
import type { LibraryDeps } from '@/lib/library-scan';

function ensureDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create();
  return dir;
}

/** The platform side of the scan and import: native reader, cover folder, copies. */
export function libraryDeps(): LibraryDeps {
  return {
    native: AudioLibrary,
    artDir: ensureDir('art').uri,
    copyIn: (sourceUri, name) => {
      const target = new File(ensureDir('tracks'), name);
      // Named after the content hash, so an existing file is this same song.
      if (!target.exists) new File(sourceUri).copy(target);
      return target.uri;
    },
    removeCopy: uri => {
      try {
        const file = new File(uri);
        if (file.exists && uri.startsWith(ensureDir('tracks').uri)) file.delete();
      } catch {
        // A copy left behind only costs space.
      }
    },
  };
}
