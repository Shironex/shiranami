import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Trash2, X, CheckCheck } from 'lucide-react';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useTranslation } from 'react-i18next';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

interface ImportBulkActionBarProps {
  tracks: PlaylistTrack[];
  isImporting: boolean;
  onDownloadSelected: (ids: Set<string>) => void;
  onRemoveSelected: (ids: Set<string>) => void;
}

export function ImportBulkActionBar({
  tracks,
  isImporting,
  onDownloadSelected,
  onRemoveSelected,
}: ImportBulkActionBarProps) {
  const { t } = useTranslation('import');
  const { t: tCommon } = useTranslation('common');

  const selectedTrackIds = useSelectionStore((s) => s.selectedTrackIds);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const count = selectedTrackIds.size;

  if (count === 0) return null;

  const pendingSelectedCount = tracks.filter(
    (t) => selectedTrackIds.has(t.id) && t.status === 'pending'
  ).length;

  const allSelected = count === tracks.length;

  const handleDownload = () => {
    onDownloadSelected(new Set(selectedTrackIds));
    clearSelection();
  };

  const handleRemove = () => {
    onRemoveSelected(new Set(selectedTrackIds));
    clearSelection();
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-3 py-2 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl shadow-black/30 max-w-[calc(100vw-2rem)] overflow-x-auto scrollbar-none"
      >
        <span className="text-xs font-medium text-muted-foreground px-2 whitespace-nowrap">
          {tCommon('selectedTracks', { count })}
        </span>

        <div className="w-px h-5 bg-border/50 mx-1" />

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => (allSelected ? clearSelection() : selectAll(tracks))}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors"
          title={allSelected ? tCommon('clearSelection') : tCommon('selectAll')}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {allSelected ? tCommon('clearSelection') : tCommon('selectAll')}
          </span>
        </motion.button>

        <div className="w-px h-5 bg-border/50 mx-1" />

        {pendingSelectedCount > 0 && !isImporting && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-accent transition-colors whitespace-nowrap"
            title={t('downloadSelected', { count: pendingSelectedCount })}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {t('downloadSelected', { count: pendingSelectedCount })}
            </span>
          </motion.button>
        )}

        {!isImporting && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={handleRemove}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition-colors whitespace-nowrap"
            title={t('removeSelected')}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('removeSelected')}</span>
          </motion.button>
        )}

        <div className="w-px h-5 bg-border/50 mx-1" />

        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={clearSelection}
          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
          title={tCommon('clearSelection')}
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
