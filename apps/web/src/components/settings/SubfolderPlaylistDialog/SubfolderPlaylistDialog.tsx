import { FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useSubfolderPlaylistDialog } from './SubfolderPlaylistDialog.hooks';
import type { ISubfolderPlaylistDialogProps, ISubfolderRow } from './SubfolderPlaylistDialog.types';

export default function SubfolderPlaylistDialog(props: ISubfolderPlaylistDialogProps) {
  const { open, onOpenChange } = props;
  const {
    t,
    subfolderCount,
    rows,
    showSelectAll,
    allSelected,
    confirmDisabled,
    onToggleSubfolder,
    onToggleAll,
    onConfirm,
    onSkip,
  } = useSubfolderPlaylistDialog(props);

  const rowItems = rows.map((row: ISubfolderRow) => (
    <label
      key={row.path}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors',
        row.alreadyExists
          ? 'opacity-60 cursor-not-allowed bg-background/30'
          : row.isSelected
            ? 'bg-primary/10 border border-primary/20'
            : 'bg-background/50 border border-border/20 hover:bg-accent/50'
      )}
    >
      <Checkbox
        checked={row.isSelected}
        disabled={row.alreadyExists}
        onCheckedChange={() => onToggleSubfolder(row.path)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{row.name}</span>
          {row.alreadyExists && (
            <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/30">
              {t('folders.playlistAlreadyExists')}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {t('folders.trackCount', { count: row.trackCount })}
        </span>
      </div>
    </label>
  ));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {t('folders.subfoldersDetected')}
          </DialogTitle>
          <DialogDescription>
            {t('folders.subfoldersDetectedDescription', { count: subfolderCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[300px] overflow-y-auto scrollbar-thin space-y-1 py-2">
          {showSelectAll && (
            <button
              onClick={onToggleAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors px-1 mb-2"
            >
              {allSelected ? t('folders.deselectAll') : t('folders.selectAll')}
            </button>
          )}

          {rowItems}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onSkip}>
            {t('folders.skipPlaylists')}
          </Button>
          <Button onClick={onConfirm} disabled={confirmDisabled}>
            {t('folders.createPlaylists')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
