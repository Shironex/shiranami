import { Play, Wand2 } from 'lucide-react';
import { useSmartMixesShelf } from './SmartMixesShelf.hooks';

/** Compact chip row of contextual smart mixes; hidden when none qualify. */
export default function SmartMixesShelf() {
  const { hasMixes, title, chips, playMix } = useSmartMixesShelf();

  // Build the chips above the return so JSX stays declarative.
  const chipNodes = chips.map(chip => {
    const { Icon } = chip;
    return (
      <button
        key={chip.id}
        type="button"
        onClick={() => playMix(chip.trackIds)}
        className="group flex items-center gap-2 rounded-full border border-border/20 bg-background/20 px-3 py-2 text-sm text-foreground/85 transition-colors hover:border-border/40 hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground/60" />
        <span className="truncate">{chip.title}</span>
        <span className="ml-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-3 fill-current text-primary" />
        </span>
      </button>
    );
  });

  if (!hasMixes) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[24px] border border-border/25 glass-panel p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-foreground">
        <Wand2 className="size-4 shrink-0 text-primary/80" />
        {title}
      </h2>
      <div className="flex flex-wrap gap-2">{chipNodes}</div>
    </section>
  );
}
