import { FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDownloadLocationPanel } from './DownloadLocationPanel.hooks';
import type { IDownloadLocationPanelProps } from './DownloadLocationPanel.types';

export default function DownloadLocationPanel(props: IDownloadLocationPanelProps) {
  const {
    pathDisplay,
    isDefault,
    updating,
    onChange,
    onReset,
    locationLabel,
    originBadge,
    locationHint,
    changeLabel,
    resetLabel,
  } = useDownloadLocationPanel(props);

  return (
    <div className="px-3 py-3 rounded-xl bg-background/50 border border-border/20 space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{locationLabel}</p>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {originBadge}
          </span>
        </div>
        <p className="text-xs text-foreground font-mono break-all">{pathDisplay}</p>
        <p className="text-[11px] text-muted-foreground/70">{locationHint}</p>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onChange}
          disabled={updating}
          className="gap-2 rounded-lg text-sm [&_svg]:size-3.5"
        >
          {updating ? <Loader2 className="animate-spin" /> : <FolderOpen />}
          {changeLabel}
        </Button>

        {!isDefault && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={updating}
            className="rounded-lg text-sm text-muted-foreground"
          >
            {resetLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
