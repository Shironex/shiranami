import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import type { IMixGridCard } from './MixesView.types';

interface IMixGridRowProps {
  readonly card: IMixGridCard;
  readonly countLabel: string;
}

/** A single curated mix-grid row with an album-art mosaic or icon fallback. */
export function MixGridRow({ card, countLabel }: IMixGridRowProps) {
  const Icon = card.icon;
  const hasMosaic = card.previewTracks.length >= 4;
  const hasSingle = card.previewTracks.length > 0;

  const mosaicTiles = card.previewTracks
    .slice(0, 4)
    .map((track, i) => (
      <img
        key={i}
        src={track.albumArt}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
      />
    ));

  return (
    <motion.button
      whileTap={{ scale: 0.99 }}
      onClick={card.onOpen}
      className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-accent/40 transition-colors group text-left"
    >
      {/* Album art mosaic or icon fallback */}
      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-accent/30">
        {hasMosaic ? (
          <div className="grid grid-cols-2 w-full h-full">{mosaicTiles}</div>
        ) : hasSingle ? (
          <img
            src={card.previewTracks[0].albumArt}
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
        <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
        <p className="text-xs text-muted-foreground/40 truncate mt-0.5">{card.desc}</p>
      </div>

      {/* Track count + play hint */}
      <div className="flex items-center gap-2 shrink-0">
        {card.count > 0 && (
          <span className="text-[11px] text-muted-foreground/30 tabular-nums">{countLabel}</span>
        )}
        <div className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
          <Play className="w-3.5 h-3.5 text-primary fill-current" />
        </div>
      </div>
    </motion.button>
  );
}
