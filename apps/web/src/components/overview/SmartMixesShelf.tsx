import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Wand2, Play } from 'lucide-react';
import { useSmartMixes } from '@/hooks/queries/useSmartMixes';
import { useMergedLibrary } from '@/hooks/useMergedLibrary';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { SMART_MIX_ICONS } from '@/components/mixes/mixDefinitions';
import type { Track } from '@/stores/types';

/**
 * Overview surface for the mood/activity/decade mixes generated from the
 * contextual signals the Overview already collects (time-of-day + weather) and
 * the library's metadata. Renders as a compact chip row; clicking a chip
 * resolves the mix's track ids against the in-memory library and starts playing
 * it. Hidden entirely when no mix qualifies (thin or untagged library), so it
 * never shows an empty shelf.
 */
export function SmartMixesShelf() {
  const { t } = useTranslation('mixes');
  const { data: mixes = [] } = useSmartMixes();
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

  if (mixes.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[24px] border border-border/25 glass-panel p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
        <Wand2 className="size-4 shrink-0 text-primary/80" />
        {t('smart.sectionTitle')}
      </h2>
      <div className="flex flex-wrap gap-2">
        {mixes.map(mix => {
          const Icon = SMART_MIX_ICONS[mix.kind];
          const title =
            mix.kind === 'decade' ? t('smart.decade', { decade: mix.decade }) : t(mix.titleKey);
          return (
            <button
              key={mix.id}
              type="button"
              onClick={() => playMix(mix.trackIds)}
              className="group flex items-center gap-2 rounded-full border border-border/20 bg-background/20 px-3 py-2 text-sm text-foreground/85 transition-colors hover:border-border/40 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground/60" />
              <span className="truncate">{title}</span>
              <span className="ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="size-3 fill-current text-primary" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
