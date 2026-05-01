import { useTranslation } from 'react-i18next';
import { FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const { t } = useTranslation('settings');

  return (
    <div className="px-3 py-3 rounded-xl bg-background/50 border border-border/20 space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{t('dl.location')}</p>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {isDefault ? t('dl.default') : t('dl.custom')}
          </span>
        </div>
        <p className="text-xs text-foreground font-mono break-all">{pathDisplay}</p>
        <p className="text-[11px] text-muted-foreground/70">{t('dl.locationHint')}</p>
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
          {t('dl.changeLocation')}
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
            {t('dl.resetDefault')}
          </Button>
        )}
      </div>
    </div>
  );
}
