import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import { SCALE_CARD, STAGGER_ITEM } from '@/lib/motion';
import { useMixGridRow } from './MixGridRow.hooks';
import type { IMixGridRowProps } from './MixGridRow.types';

/** A single curated mix-grid row with an album-art mosaic or icon fallback. */
export default function MixGridRow(props: IMixGridRowProps) {
  const {
    icon: Icon,
    art,
    mosaicTiles,
    singleArt,
    title,
    desc,
    showCount,
    countLabel,
    onOpen,
  } = useMixGridRow(props);

  return (
    <motion.button
      variants={STAGGER_ITEM}
      whileTap={SCALE_CARD}
      onClick={onOpen}
      className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-accent/40 transition-colors group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Album art mosaic or icon fallback */}
      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-accent/30">
        {art === 'mosaic' ? (
          <div className="grid grid-cols-2 w-full h-full">{mosaicTiles}</div>
        ) : art === 'single' ? (
          <img
            src={singleArt}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted-foreground/30" />
          </div>
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground/40 truncate mt-0.5">{desc}</p>
      </div>

      {/* Track count + play hint */}
      <div className="flex items-center gap-2 shrink-0">
        {showCount && (
          <span className="text-[11px] text-muted-foreground/30 tabular-nums">{countLabel}</span>
        )}
        <div className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
          <Play className="w-3.5 h-3.5 text-primary fill-current" />
        </div>
      </div>
    </motion.button>
  );
}
