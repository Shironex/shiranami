import { Play } from 'lucide-react';
import { motion } from 'motion/react';
import { SCALE_CARD } from '@/lib/motion';
import { useSmartMixRow } from './SmartMixRow.hooks';
import type { ISmartMixRowProps } from './SmartMixRow.types';

/** A single "For you right now" smart-mix row. Presentational; logic lives in the hook. */
export default function SmartMixRow(props: ISmartMixRowProps) {
  const { icon: Icon, title, desc, countLabel, onPlay } = useSmartMixRow(props);

  return (
    <motion.button
      whileTap={SCALE_CARD}
      onClick={onPlay}
      className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-accent/40 transition-colors group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="w-12 h-12 rounded-lg shrink-0 bg-accent/30 flex items-center justify-center">
        <Icon className="w-5 h-5 text-muted-foreground/50" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground/40 truncate mt-0.5">{desc}</p>
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
