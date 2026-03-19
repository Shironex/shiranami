import { FolderOpen, Loader2 } from 'lucide-react';

type DownloadLocationPanelProps = {
  pathDisplay: string;
  isDefault: boolean;
  updating: boolean;
  onChange: () => void;
  onReset: () => void;
};

export function DownloadLocationPanel({
  pathDisplay,
  isDefault,
  updating,
  onChange,
  onReset,
}: DownloadLocationPanelProps) {
  return (
    <div className="px-3 py-3 rounded-xl bg-background/50 border border-border/20 space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">Download location</p>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {isDefault ? 'Default' : 'Custom'}
          </span>
        </div>
        <p className="text-xs text-foreground font-mono break-all">{pathDisplay}</p>
        <p className="text-[11px] text-muted-foreground/70">
          Search downloads are saved here automatically.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onChange}
          disabled={updating}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent hover:bg-accent/80 text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FolderOpen className="w-3.5 h-3.5" />
          )}
          Change location
        </button>

        {!isDefault && (
          <button
            type="button"
            onClick={onReset}
            disabled={updating}
            className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset to default
          </button>
        )}
      </div>
    </div>
  );
}
