import { useMemo } from 'react';
import type { Track } from '@/stores/types';
import { MIX_LIMIT, type MixId } from './mixDefinitions';

/** Get preview tracks for the mix grid (album art thumbnails). */
export function useMixPreviews(library: Track[]): Record<MixId, Track[]> {
  return useMemo(() => ({
    'most-played': [...library]
      .filter((t) => (t.playCount ?? 0) > 0 && t.albumArt)
      .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
      .slice(0, 4),
    'recently-added': [...library]
      .filter((t) => t.createdAt && t.albumArt)
      .sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      })
      .slice(0, 4),
    'recently-played': [],
    'never-played': library
      .filter((t) => (!t.playCount || t.playCount === 0) && t.albumArt)
      .slice(0, 4),
  }), [library]);
}

export function getMixPreviewCount(mixId: MixId, library: Track[]): number {
  switch (mixId) {
    case 'most-played':
      return Math.min(MIX_LIMIT, library.filter((t) => (t.playCount ?? 0) > 0).length);
    case 'recently-added':
      return Math.min(MIX_LIMIT, library.length);
    case 'never-played':
      return Math.min(MIX_LIMIT, library.filter((t) => !t.playCount || t.playCount === 0).length);
    case 'recently-played':
      return 0;
    default:
      return 0;
  }
}
