import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaylistsQuery } from '@/hooks/queries/usePlaylists';
import type { Playlist } from '@/types/electron';
import type {
  ISubfolderPlaylistDialogProps,
  ISubfolderPlaylistDialogView,
  ISubfolderRow,
} from './SubfolderPlaylistDialog.types';

export function useSubfolderPlaylistDialog({
  open,
  onOpenChange,
  subfolders,
  onConfirm,
  existingPlaylistNames,
}: ISubfolderPlaylistDialogProps): ISubfolderPlaylistDialogView {
  const { t } = useTranslation('settings');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());

  // Fallback source for existing playlist names if the parent didn't pass them in.
  const { data: fetchedPlaylists } = usePlaylistsQuery();

  // Recompute which subfolder names collide with existing playlists, and seed
  // the selection to the non-colliding rows, whenever the dialog opens.
  useEffect(() => {
    if (!open || subfolders.length === 0) return;

    const sourceNames =
      existingPlaylistNames ??
      new Set((fetchedPlaylists as Playlist[] | undefined)?.map(p => p.name) ?? []);

    const existing = new Set<string>();
    for (const sf of subfolders) {
      if (sourceNames.has(sf.name)) existing.add(sf.name);
    }
    setExistingNames(existing);
    setSelected(new Set(subfolders.filter(sf => !existing.has(sf.name)).map(sf => sf.path)));
  }, [open, subfolders, existingPlaylistNames, fetchedPlaylists]);

  const onToggleSubfolder = useCallback((path: string) => {
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
  const allSelected =
    selectableSubfolders.length > 0 && selectableSubfolders.every(sf => selected.has(sf.path));

  const onToggleAll = useCallback(() => {
    setSelected(prev => {
      const allOn =
        selectableSubfolders.length > 0 && selectableSubfolders.every(sf => prev.has(sf.path));
      return allOn ? new Set() : new Set(selectableSubfolders.map(sf => sf.path));
    });
  }, [selectableSubfolders]);

  const onConfirmSelection = useCallback(() => {
    const selectedFolders = subfolders.filter(sf => selected.has(sf.path));
    onConfirm(selectedFolders);
    onOpenChange(false);
  }, [subfolders, selected, onConfirm, onOpenChange]);

  const onSkip = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const rows: ISubfolderRow[] = subfolders.map(sf => ({
    name: sf.name,
    path: sf.path,
    trackCount: sf.tracks.length,
    isSelected: selected.has(sf.path),
    alreadyExists: existingNames.has(sf.name),
  }));

  return {
    t,
    subfolderCount: subfolders.length,
    rows,
    showSelectAll: selectableSubfolders.length > 1,
    allSelected,
    confirmDisabled: selected.size === 0,
    onToggleSubfolder,
    onToggleAll,
    onConfirm: onConfirmSelection,
    onSkip,
  };
}
