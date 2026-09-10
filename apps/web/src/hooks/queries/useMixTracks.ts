import { useMemo } from 'react';
import { useMergedLibrary } from '@/hooks/useMergedLibrary';
import type { Track } from '@/stores/types';
import { useHistoryQuery } from '@/hooks/queries/useHistory';
import { MIX_LIMIT, type MixId } from '@/components/mixes/mixDefinitions';

export function useMixTracks(mixId: MixId | null): Track[] {
  // Merged so `most-played` / `never-played` see the overlay-bumped play count
  // recorded this session, not the stale canonical-library seed value.
  const library = useMergedLibrary();
  const { data: historyData } = useHistoryQuery('all');

  return useMemo(() => {
    if (!mixId) return [];

    switch (mixId) {
      case 'most-played':
        return [...library]
          .filter(t => (t.playCount ?? 0) > 0)
          .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
          .slice(0, MIX_LIMIT);

      case 'recently-added':
        return [...library]
          .filter(t => t.createdAt)
          .sort((a, b) => {
            const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return db - da;
          })
          .slice(0, MIX_LIMIT);

      case 'recently-played': {
        if (!historyData?.recent?.length) return [];
        const seen = new Set<string>();
        const trackIds: string[] = [];
        for (const entry of historyData.recent) {
          if (!seen.has(entry.trackId)) {
            seen.add(entry.trackId);
            trackIds.push(entry.trackId);
          }
        }
        const libraryMap = new Map(library.map(t => [t.id, t]));
        return trackIds
          .map(id => libraryMap.get(id))
          .filter((t): t is Track => t != null)
          .slice(0, MIX_LIMIT);
      }

      case 'never-played':
        return library.filter(t => !t.playCount || t.playCount === 0).slice(0, MIX_LIMIT);

      default:
        return [];
    }
  }, [mixId, library, historyData]);
}
