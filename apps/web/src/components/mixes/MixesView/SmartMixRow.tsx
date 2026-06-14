import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import type { ISmartMixCard } from './MixesView.types';

interface ISmartMixRowProps {
  readonly card: ISmartMixCard;
  readonly countLabel: string;
}

/** A single "For you right now" smart-mix row. Presentational; logic lives in the hook. */
export function SmartMixRow({ card, countLabel }: ISmartMixRowProps) {
  const Icon = card.icon;
  return (
    <motion.button
      whileTap={{ scale: 0.99 }}
      onClick={card.onPlay}
      className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-accent/40 transition-colors group text-left"
    >
      <div className="w-12 h-12 rounded-lg shrink-0 bg-accent/30 flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{card.title}</p>
        <p className="text-xs text-muted-foreground/40 truncate mt-0.5">{card.desc}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground/30 tabular-nums">{countLabel}</span>
        <div className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-primary/10">
          <Play className="w-3.5 h-3.5 text-primary fill-current" />
        </div>
      </div>
    </motion.button>
  );
}
