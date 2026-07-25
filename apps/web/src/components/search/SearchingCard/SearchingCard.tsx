import { Loader2 } from 'lucide-react';
import { useSearchingCard } from './SearchingCard.hooks';
import type { ISearchingCardProps } from './SearchingCard.types';

export default function SearchingCard(props: ISearchingCardProps) {
  const { title, subtitle } = useSearchingCard(props);

  return (
    <div className="flex-1 min-h-full flex items-center justify-center">
      <div className="w-full max-w-lg flex flex-col items-center gap-6 px-10 py-14 text-center glass-subtle rounded-[28px] border border-border/30">
        <div className="relative">
          <div className="w-28 h-28 rounded-[28px] bg-primary/8 border border-primary/10 flex items-center justify-center">
            <img
              src="./mascot.png"
              alt=""
              aria-hidden="true"
              className="w-[4.5rem] h-[4.5rem] object-contain opacity-70 float-mascot"
              draggable={false}
            />
          </div>
          <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-card border border-border/40 flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
        </div>
        <div>
          <p className="font-display text-base font-semibold text-foreground/85">{title}</p>
          <p className="text-sm text-muted-foreground/60 mt-1.5 leading-relaxed">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
