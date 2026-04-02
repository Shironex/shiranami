import { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Paths, File, Directory } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';

const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
];

export interface ImportedFile {
  id: string;
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

function getTracksDir(): Directory {
  const dir = new Directory(Paths.document, 'tracks');
  if (!dir.exists) {
    dir.create();
  }
  return dir;
}

export function useDocumentPicker() {
  const [importing, setImporting] = useState(false);

  const pickFiles = useCallback(async (): Promise<ImportedFile[]> => {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_TYPES,
        multiple: true,
        copyToCacheDirectory: false,
      });

      if (result.canceled || !result.assets?.length) {
        return [];
      }

      const tracksDir = getTracksDir();
      const imported: ImportedFile[] = [];

      for (const asset of result.assets) {
        const id = randomUUID();
        const ext = asset.name.split('.').pop() ?? 'mp3';
        const destFile = new File(tracksDir, `${id}.${ext}`);

        const sourceFile = new File(asset.uri);
        sourceFile.copy(destFile);

        imported.push({
          id,
          uri: destFile.uri,
          name: asset.name,
          size: asset.size ?? 0,
          mimeType: asset.mimeType ?? 'audio/mpeg',
        });
      }

      return imported;
    } finally {
      setImporting(false);
    }
  }, []);

  return { pickFiles, importing };
}
