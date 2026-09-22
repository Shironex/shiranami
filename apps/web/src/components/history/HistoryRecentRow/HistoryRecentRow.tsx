import { motion } from 'motion/react';
import { STAGGER_ITEM } from '@/lib/motion';
import { HistoryTrackArtwork } from '@/components/history/HistoryTrackArtwork';
import { useHistoryRecentRow } from './HistoryRecentRow.hooks';
import type { IHistoryRecentRowProps } from './HistoryRecentRow.types';

export default function HistoryRecentRow(props: IHistoryRecentRowProps) {
  const { entry, subtitle, playedDuration, playedAt, onPlay } = useHistoryRecentRow(props);

  return (
    <motion.button
      type="button"
      variants={STAGGER_ITEM}
      onClick={onPlay}
      className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-border/20 bg-background/25 px-3 py-3 text-left transition-colors hover:border-border/35 hover:bg-accent/35"
    >
      <HistoryTrackArtwork albumArt={entry.albumArt} title={entry.title} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">{playedDuration}</p>
        <p className="text-[11px] text-muted-foreground/65">{playedAt}</p>
      </div>
    </motion.button>
  );
}
