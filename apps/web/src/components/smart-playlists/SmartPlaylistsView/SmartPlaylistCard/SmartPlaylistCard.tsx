import { Sparkles } from 'lucide-react';
import { useSmartPlaylistCard } from './SmartPlaylistCard.hooks';
import type { ISmartPlaylistCardProps } from './SmartPlaylistCard.types';

export default function SmartPlaylistCard(props: ISmartPlaylistCardProps) {
  const { name, ruleSummary, onOpen } = useSmartPlaylistCard(props);

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 w-full rounded-xl border border-border/40 bg-card/50 p-3 text-left transition-colors hover:bg-accent"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground">{ruleSummary}</p>
      </div>
    </button>
  );
}
