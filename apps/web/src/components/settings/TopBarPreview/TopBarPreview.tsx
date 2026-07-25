import { cn } from '@/lib/utils';
import { SettingsPreview } from '@/components/settings/SettingsPreview';
import { useTopBarPreview } from './TopBarPreview.hooks';
import type { ITopBarPreviewProps } from './TopBarPreview.types';

export default function TopBarPreview(props: ITopBarPreviewProps) {
  const { title, enabled } = useTopBarPreview(props);

  return (
    <SettingsPreview title={title}>
      <div
        className="rounded-xl border border-border/30 bg-background/40 p-3"
        role="img"
        aria-label={title}
      >
        <div className="mx-auto flex h-10 max-w-[340px] items-center gap-2 rounded-xl border border-border/25 bg-surface/60 px-3">
          <div className="h-2 w-14 rounded-full bg-foreground/25" />
          <div className="flex-1" />
          <div className="h-5 w-12 rounded-md border border-border/30 bg-muted/25" />
          <div
            className={cn(
              'flex items-center gap-0.5 overflow-hidden transition-all duration-300',
              enabled ? 'max-w-16 opacity-100' : 'max-w-0 opacity-0'
            )}
          >
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              EN
            </span>
            <span className="px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/60">
              PL
            </span>
          </div>
          <div className="flex items-center gap-1" aria-hidden="true">
            <div className="size-1.5 rounded-full bg-muted-foreground/30" />
            <div className="size-1.5 rounded-full bg-muted-foreground/30" />
            <div className="size-1.5 rounded-full bg-muted-foreground/30" />
          </div>
        </div>
      </div>
    </SettingsPreview>
  );
}
