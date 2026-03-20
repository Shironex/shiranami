import { Loader2 } from 'lucide-react';

interface SearchStateCardProps {
  title: string;
  description: string;
  loading?: boolean;
  children?: React.ReactNode;
}

export function SearchStateCard({
  title,
  description,
  loading = false,
  children,
}: SearchStateCardProps) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-border/30 bg-surface/40 px-8 py-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div className="mx-auto relative w-24 h-24 rounded-[28px] bg-primary/8 border border-primary/10 flex items-center justify-center">
          <img
            src="./mascot.png"
            alt=""
            className="w-16 h-16 object-contain opacity-80"
            draggable={false}
          />
          {loading && (
            <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-card border border-border/40 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
          )}
        </div>

        <div className="mt-6">
          <p className="font-display text-lg font-semibold text-foreground">{title}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}
