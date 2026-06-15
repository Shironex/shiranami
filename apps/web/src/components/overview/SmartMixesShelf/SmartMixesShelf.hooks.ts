import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSmartMixes } from '@/hooks/queries/useSmartMixes';
import { useMergedLibrary } from '@/hooks/useMergedLibrary';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { SMART_MIX_ICONS } from '@/components/mixes/mixDefinitions';
import type { Track } from '@/stores/types';
import type { ISmartMixChip, ISmartMixesShelfView } from './SmartMixesShelf.types';

/**
 * Overview surface for the mood/activity/decade mixes generated from the
 * contextual signals the Overview already collects (time-of-day + weather) and
 * the library's metadata. Clicking a chip resolves the mix's track ids against
 * the in-memory library and starts playing it. Hidden entirely when no mix
 * qualifies, so it never shows an empty shelf.
 */
export function useSmartMixesShelf(): ISmartMixesShelfView {
  const { t } = useTranslation('mixes');
  // null (generation failed) collapses to empty here: this compact Overview
  // shelf stays hidden rather than surfacing an error — the Mixes view owns the
  // honest failure notice.
  const { data: mixes } = useSmartMixes();
  const mixList = mixes ?? [];
  const library = useMergedLibrary();
  const setQueue = usePlaybackStore(s => s.setQueue);

  const playMix = useCallback(
    (trackIds: string[]) => {
      const byId = new Map(library.map(track => [track.id, track]));
      const resolved = trackIds
        .map(id => byId.get(id))
        .filter((track): track is Track => Boolean(track));
      if (resolved.length === 0) return;
      setQueue(resolved, 0);
    },
    [library, setQueue]
  );

  const chips: ISmartMixChip[] = mixList.map(mix => ({
    id: mix.id,
    title: mix.kind === 'decade' ? t('smart.decade', { decade: mix.decade }) : t(mix.titleKey),
    Icon: SMART_MIX_ICONS[mix.kind],
    trackIds: mix.trackIds,
  }));

  return {
    hasMixes: mixList.length > 0,
    title: t('smart.sectionTitle'),
    chips,
    playMix,
  };
}
