import { Directory, File, Paths } from 'expo-file-system';
import type { FileDeleter } from '@/lib/removal';

/** The app's real tracks folder, where imports are copied. */
export function appFileDeleter(): FileDeleter {
  return {
    tracksDirUri: new Directory(Paths.document, 'tracks').uri,
    deleteFile: uri => {
      const file = new File(uri);
      if (file.exists) file.delete();
    },
  };
}
