import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Trash2, X, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useTranslation } from 'react-i18next';
import type { PlaylistTrack } from '@/stores/usePlaylistImportStore';

interface ImportBulkActionBarProps {
  tracks: PlaylistTrack[];
  isImporting: boolean;
  onDownloadSelected: (ids: Set<string>) => void;
  onRemoveSelected: (ids: Set<string>) => void;
}

// Shared button classes. Icon-only below md (where the dock stays compact and
// fits even a 360px viewport), label appears at md+. min-h-9/min-w-9 keeps the
// icon-only hit area near the 44px touch-target guideline; focus-visible adds a
// keyboard ring. This is the lighter sibling of BulkActionBar: with at most two
// real actions it never needs an overflow menu, so delaying labels is enough to
// stop the worst-case (Polish) row from overflowing into invisible scroll.
const actionButtonClass = cn(
  'shrink-0 flex items-center justify-center md:justify-start gap-1.5 min-h-9 min-w-9 px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card'
);

export function ImportBulkActionBar({
  tracks,
  isImporting,
  onDownloadSelected,
  onRemoveSelected,
}: ImportBulkActionBarProps) {
  const { t } = useTranslation('import');
  const { t: tCommon } = useTranslation('common');

  const selectedTrackIds = useSelectionStore(s => s.selectedTrackIds);
  const clearSelection = useSelectionStore(s => s.clearSelection);
  const selectAll = useSelectionStore(s => s.selectAll);
  const count = selectedTrackIds.size;

  if (count === 0) return null;

  const pendingSelectedCount = tracks.filter(
    t => selectedTrackIds.has(t.id) && t.status === 'pending'
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
        role="toolbar"
        aria-label={tCommon('bulkActionsLabel')}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-3 py-2 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl shadow-black/30 max-w-[calc(100vw-2rem)] overflow-x-auto scrollbar-none"
      >
        <span className="shrink-0 text-xs font-medium text-muted-foreground px-2 whitespace-nowrap">
          {/* Just the count below sm so the counter does not eat the width on a
              narrow viewport; full label from sm up. */}
          <span className="sm:hidden">{count}</span>
          <span className="hidden sm:inline">{tCommon('selectedTracks', { count })}</span>
        </span>

        <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => (allSelected ? clearSelection() : selectAll(tracks))}
          className={cn(
            actionButtonClass,
            'text-primary/80 hover:text-primary hover:bg-primary/10'
          )}
          title={allSelected ? tCommon('clearSelection') : tCommon('selectAll')}
          aria-label={allSelected ? tCommon('clearSelection') : tCommon('selectAll')}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span className="hidden md:inline whitespace-nowrap">
            {allSelected ? tCommon('clearSelection') : tCommon('selectAll')}
          </span>
        </motion.button>

        <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />

        {pendingSelectedCount > 0 && !isImporting && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={handleDownload}
            className={cn(
              actionButtonClass,
              'text-foreground/70 hover:text-foreground hover:bg-accent'
            )}
            title={t('downloadSelected', { count: pendingSelectedCount })}
            aria-label={t('downloadSelected', { count: pendingSelectedCount })}
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {t('downloadSelected', { count: pendingSelectedCount })}
            </span>
          </motion.button>
        )}

        {!isImporting && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={handleRemove}
            className={cn(
              actionButtonClass,
              'text-destructive/80 hover:text-destructive hover:bg-destructive/10'
            )}
            title={t('removeSelected')}
            aria-label={t('removeSelected')}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('removeSelected')}</span>
          </motion.button>
        )}

        <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />

        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={clearSelection}
          className={cn(
            'shrink-0 flex items-center justify-center min-h-9 min-w-9 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card'
          )}
          title={tCommon('clearSelection')}
          aria-label={tCommon('clearSelection')}
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
