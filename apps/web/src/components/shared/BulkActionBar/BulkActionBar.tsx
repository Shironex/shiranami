import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, ListPlus, Heart, Trash2, X, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useBulkActionBar } from './BulkActionBar.hooks';
import type { IBulkActionBarProps } from './BulkActionBar.types';
import { MoreMenu, type IOverflowAction } from './MoreMenu';

interface IActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

// Inline dock action. Icon-only below md; label appears at md+. The
// always-visible Play Next / Add to Queue follow this rule directly; the
// secondary/destructive actions only mount inside the xl+ wrapper, so they
// never appear without a label. min-h-9/min-w-9 keeps the icon-only hit area
// near the 44px touch-target guideline.
function ActionButton({ icon, label, onClick, variant = 'default' }: IActionButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={cn(
        'shrink-0 flex items-center justify-center md:justify-start gap-1.5 min-h-9 min-w-9 px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
        variant === 'destructive'
          ? 'text-destructive/80 hover:text-destructive hover:bg-destructive/10'
          : 'text-foreground/70 hover:text-foreground hover:bg-accent'
      )}
      title={label}
      aria-label={label}
    >
      {icon}
      <span className="hidden md:inline whitespace-nowrap">{label}</span>
    </motion.button>
  );
}

export default function BulkActionBar(props: IBulkActionBarProps) {
  const {
    t,
    tCommon,
    isVisible,
    count,
    allSelected,
    hasRemoveFromPlaylist,
    onPlayNext,
    onAddToQueue,
    onToggleFavorite,
    onToggleSelectAll,
    onRemoveFromPlaylist,
    onRemoveFromLibrary,
    onDeleteFromDisk,
    onClearSelection,
  } = useBulkActionBar(props);

  if (!isVisible) return null;

  const selectAllLabel = allSelected ? tCommon('clearSelection') : tCommon('selectAll');

  // The secondary/destructive set. Rendered inline at xl+ (where the worst-case
  // PL/8-button row provably fits within max-w-[calc(100vw-2rem)]) and collapsed
  // into the More menu below xl. The audit measured 768px overflowing with full
  // labels; live measurement showed the full PL row needs ~1178px of content,
  // which only fits from the xl breakpoint (1280px) up.
  const overflowActions: IOverflowAction[] = [
    {
      key: 'toggleFavorites',
      icon: <Heart className="w-4 h-4" />,
      label: t('toggleFavorites'),
      onClick: onToggleFavorite,
    },
    ...(hasRemoveFromPlaylist
      ? [
          {
            key: 'removeFromPlaylist',
            icon: <X className="w-4 h-4" />,
            label: t('removeFromPlaylist'),
            onClick: onRemoveFromPlaylist,
            variant: 'destructive' as const,
          },
        ]
      : []),
    {
      key: 'removeFromLibrary',
      icon: <Trash2 className="w-4 h-4" />,
      label: t('removeFromLibrary'),
      onClick: onRemoveFromLibrary,
      variant: 'destructive' as const,
    },
    ...(IS_ELECTRON
      ? [
          {
            key: 'deleteFromDisk',
            icon: <Trash2 className="w-4 h-4" />,
            label: t('deleteFromDisk'),
            onClick: onDeleteFromDisk,
            variant: 'destructive' as const,
          },
        ]
      : []),
  ];

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
          {/* Just the count below sm so the counter does not eat ~40% of a
              360px viewport; full label from sm up. */}
          <span className="sm:hidden">{count}</span>
          <span className="hidden sm:inline">{tCommon('selectedTracks', { count })}</span>
        </span>

        <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onToggleSelectAll}
          className={cn(
            'shrink-0 flex items-center justify-center md:justify-start gap-1.5 min-h-9 min-w-9 px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card'
          )}
          title={selectAllLabel}
          aria-label={selectAllLabel}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span className="hidden md:inline whitespace-nowrap">{selectAllLabel}</span>
        </motion.button>

        <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />

        <ActionButton
          icon={<Play className="w-3.5 h-3.5" />}
          label={t('playNext')}
          onClick={onPlayNext}
        />
        <ActionButton
          icon={<ListPlus className="w-3.5 h-3.5" />}
          label={t('addToQueue')}
          onClick={onAddToQueue}
        />

        {/* Secondary/destructive set inline only at xl+. The worst case
            (PL labels + Electron + playlist view = 8 buttons) measures ~1178px
            of content, so it is only guaranteed to fit within
            max-w-[calc(100vw-2rem)] from the xl breakpoint (1280px) up. Below
            that it lives in the More menu, so destructive actions never scroll
            off an invisible edge. */}
        <div className="hidden xl:flex xl:items-center xl:gap-1">
          <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />

          <ActionButton
            icon={<Heart className="w-3.5 h-3.5" />}
            label={t('toggleFavorites')}
            onClick={onToggleFavorite}
          />

          {hasRemoveFromPlaylist && (
            <ActionButton
              icon={<X className="w-3.5 h-3.5" />}
              label={t('removeFromPlaylist')}
              onClick={onRemoveFromPlaylist}
              variant="destructive"
            />
          )}

          <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />

          <ActionButton
            icon={<Trash2 className="w-3.5 h-3.5" />}
            label={t('removeFromLibrary')}
            onClick={onRemoveFromLibrary}
            variant="destructive"
          />
          {IS_ELECTRON && (
            <ActionButton
              icon={<Trash2 className="w-3.5 h-3.5" />}
              label={t('deleteFromDisk')}
              onClick={onDeleteFromDisk}
              variant="destructive"
            />
          )}
        </div>

        {/* Same set collapsed into an overflow menu below xl */}
        <div className="flex items-center xl:hidden">
          <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />
          <MoreMenu actions={overflowActions} />
        </div>

        <div className="shrink-0 w-px h-5 bg-border/50 mx-1" />

        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={onClearSelection}
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
