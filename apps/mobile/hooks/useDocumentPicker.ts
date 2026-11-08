import { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import type { PickedFile } from '@/lib/library-scan';

const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
];

/** The system file picker for audio. Picked files stay where they are; import decides on copies. */
export function useDocumentPicker() {
  const [picking, setPicking] = useState(false);

  const pickFiles = useCallback(async (): Promise<PickedFile[]> => {
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_TYPES,
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (result.canceled || !result.assets?.length) return [];
      return result.assets.map(asset => ({ uri: asset.uri, name: asset.name }));
    } finally {
      setPicking(false);
    }
  }, []);

  return { pickFiles, picking };
}
