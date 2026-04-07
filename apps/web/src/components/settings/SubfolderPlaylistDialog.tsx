import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IS_ELECTRON } from '@/lib/platform';
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
import type { TrackMetadata } from '@/types/electron';

interface SubfolderEntry {
  name: string;
  path: string;
  tracks: Array<{ filePath: string; metadata: TrackMetadata }>;
}

interface SubfolderPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subfolders: SubfolderEntry[];
  onConfirm: (selectedSubfolders: SubfolderEntry[]) => void;
  existingPlaylistNames?: Set<string>;
}

export function SubfolderPlaylistDialog({
  open,
  onOpenChange,
  subfolders,
  onConfirm,
  existingPlaylistNames,
}: SubfolderPlaylistDialogProps) {
  const { t } = useTranslation('settings');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());

  // Check which subfolder names already exist as playlists
  useEffect(() => {
    if (!open || subfolders.length === 0) return;

    // Use passed-in names if available, otherwise fetch
    if (existingPlaylistNames) {
      const existing = new Set<string>();
      for (const sf of subfolders) {
        if (existingPlaylistNames.has(sf.name)) existing.add(sf.name);
      }
      setExistingNames(existing);
      setSelected(new Set(
        subfolders.filter(sf => !existing.has(sf.name)).map(sf => sf.path)
      ));
      return;
    }

    if (!IS_ELECTRON) return;

    let cancelled = false;

    async function checkExisting() {
      const existing = new Set<string>();
      try {
        const allPlaylists = (await window.electronAPI.db.playlists.getAll()) as Array<{ name: string }>;
        const fetchedNames = new Set(allPlaylists.map(p => p.name));
        for (const sf of subfolders) {
          if (fetchedNames.has(sf.name)) existing.add(sf.name);
        }
      } catch {
        // ignore lookup failures
      }
      if (!cancelled) {
        setExistingNames(existing);
        setSelected(new Set(
          subfolders.filter(sf => !existing.has(sf.name)).map(sf => sf.path)
        ));
      }
    }

    checkExisting();
    return () => { cancelled = true; };
  }, [open, subfolders, existingPlaylistNames]);

  const toggleSubfolder = useCallback((path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const selectableSubfolders = subfolders.filter(sf => !existingNames.has(sf.name));
  const allSelected = selectableSubfolders.length > 0 && selectableSubfolders.every(sf => selected.has(sf.path));

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableSubfolders.map(sf => sf.path)));
    }
  }, [allSelected, selectableSubfolders]);

  const handleConfirm = useCallback(() => {
    const selectedFolders = subfolders.filter(sf => selected.has(sf.path));
    onConfirm(selectedFolders);
    onOpenChange(false);
  }, [subfolders, selected, onConfirm, onOpenChange]);

  const handleSkip = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            {t('folders.subfoldersDetected')}
          </DialogTitle>
          <DialogDescription>
            {t('folders.subfoldersDetectedDescription', { count: subfolders.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[300px] overflow-y-auto scrollbar-thin space-y-1 py-2">
          {/* Select all / Deselect all */}
          {selectableSubfolders.length > 1 && (
            <button
              onClick={handleToggleAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors px-1 mb-2"
            >
              {allSelected ? t('folders.deselectAll') : t('folders.selectAll')}
            </button>
          )}

          {subfolders.map(sf => {
            const alreadyExists = existingNames.has(sf.name);
            return (
              <label
                key={sf.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                  alreadyExists
                    ? 'opacity-60 cursor-not-allowed bg-background/30'
                    : selected.has(sf.path)
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-background/50 border border-border/20 hover:bg-accent/50'
                }`}
              >
                <Checkbox
                  checked={selected.has(sf.path)}
                  disabled={alreadyExists}
                  onCheckedChange={() => toggleSubfolder(sf.path)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {sf.name}
                    </span>
                    {alreadyExists && (
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/30">
                        {t('folders.playlistAlreadyExists')}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('folders.trackCount', { count: sf.tracks.length })}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip}>
            {t('folders.skipPlaylists')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0}
          >
            {t('folders.createPlaylists')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
