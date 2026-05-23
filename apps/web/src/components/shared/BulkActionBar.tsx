import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, ListPlus, Heart, Trash2, X, CheckCheck, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import type { Track } from '@/stores/types';
import { useSelectionStore } from '@/stores/useSelectionStore';
import { useRemoveFromLibrary } from '@/hooks/useRemoveFromLibrary';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface BulkActionBarProps {
  trackList: Track[];
  onRemoveFromPlaylist?: (trackIds: string[]) => void;
}

interface ActionButtonProps {
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
function ActionButton({ icon, label, onClick, variant = 'default' }: ActionButtonProps) {
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

interface MenuActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

// Row inside the overflow popover. Mirrors the TrackContextMenu MenuItem idiom
// (~40px row, full label, destructive variant) so the two surfaces feel like
// one family.
function MenuAction({ icon, label, onClick, variant = 'default' }: MenuActionProps) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
        'focus-visible:outline-none focus-visible:bg-accent',
        variant === 'destructive'
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground/80 hover:text-foreground hover:bg-accent'
      )}
    >
      <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
        {icon}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function Divider() {
  return <div role="separator" className="my-1 border-t border-border/50" />;
}

interface OverflowAction {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

// Overflow trigger + popover. The popover is portalled to document.body with
// fixed positioning derived from the trigger's getBoundingClientRect so it
// escapes the dock's overflow-x-auto clip (the previous clipped-popover bug in
// this file). Pattern mirrors AddToPlaylistButton / PlaylistPickerContent.
function MoreMenu({ actions }: { actions: OverflowAction[] }) {
  const { t: tCommon } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: 'fixed',
      // Pin the popover's right edge to the trigger's right edge, then clamp so
      // it never bleeds off the left of a 360px viewport.
      right: Math.max(window.innerWidth - rect.right, 8),
      // Open above the dock — there is rarely space below the bottom-24 dock.
      bottom: window.innerHeight - rect.top + 8,
      minWidth: 200,
      maxWidth: 'calc(100vw - 1rem)',
      zIndex: 50,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const handleAction = useCallback((onClick: () => void) => {
    setIsOpen(false);
    onClick();
  }, []);

  return (
    <>
      <motion.button
        ref={buttonRef}
        whileTap={{ scale: 0.92 }}
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          'shrink-0 flex items-center justify-center min-h-9 min-w-9 p-1.5 rounded-lg text-xs font-medium transition-colors',
          'text-foreground/70 hover:text-foreground hover:bg-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
          isOpen && 'text-foreground bg-accent'
        )}
        title={tCommon('more')}
        aria-label={tCommon('more')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </motion.button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={popoverRef}
              role="menu"
              aria-label={tCommon('more')}
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 6 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/30"
              style={{ ...popoverStyle, transformOrigin: 'bottom right' }}
            >
              {actions.map((action, i) => {
                const prev = actions[i - 1];
                const showDivider =
                  prev && prev.variant !== 'destructive' && action.variant === 'destructive';
                return (
                  <div key={action.key} role="none">
                    {showDivider && <Divider />}
                    <MenuAction
                      icon={action.icon}
                      label={action.label}
                      variant={action.variant}
                      onClick={() => handleAction(action.onClick)}
                    />
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

export function BulkActionBar({ trackList, onRemoveFromPlaylist }: BulkActionBarProps) {
  const { t } = useTranslation('contextMenu');
  const { t: tToast } = useTranslation('toast');
  const { t: tCommon } = useTranslation('common');

  const selectedTrackIds = useSelectionStore(s => s.selectedTrackIds);
  const clearSelection = useSelectionStore(s => s.clearSelection);
  const selectAll = useSelectionStore(s => s.selectAll);
  const count = selectedTrackIds.size;

  const addToQueue = usePlaybackStore(s => s.addToQueue);
  const playNext = usePlaybackStore(s => s.playNext);
  const toggleFavorite = useLibraryStore(s => s.toggleFavorite);
  const library = useLibraryStore(s => s.library);

  const { handleRemoveFromLibrary, handleDeleteFromDisk } = useRemoveFromLibrary();

  if (count === 0) return null;

  const selectedTracks = library.filter(t => selectedTrackIds.has(t.id));
  const resolvedTracks =
    selectedTracks.length > 0 ? selectedTracks : trackList.filter(t => selectedTrackIds.has(t.id));
  const ids = Array.from(selectedTrackIds);

  const handlePlayNext = () => {
    for (const t of resolvedTracks) {
      playNext(t);
    }
    toast.success(tToast('tracksPlayNext', { count }));
    clearSelection();
  };

  const handleAddToQueue = () => {
    addToQueue(resolvedTracks);
    toast.success(tToast('addedTracksToQueue', { count }));
    clearSelection();
  };

  const handleToggleFavorite = () => {
    for (const id of ids) {
      toggleFavorite(id);
    }
    clearSelection();
  };

  const onRemoveFromLibrary = async () => {
    await handleRemoveFromLibrary(ids);
    clearSelection();
  };

  const onDeleteFromDisk = async () => {
    await handleDeleteFromDisk(ids, resolvedTracks);
    clearSelection();
  };

  const handleRemoveFromPlaylistClick = () => {
    if (onRemoveFromPlaylist) {
      onRemoveFromPlaylist(ids);
      clearSelection();
    }
  };

  const allSelected = count === trackList.length;

  // The secondary/destructive set. Rendered inline at xl+ (where the worst-case
  // PL/8-button row provably fits within max-w-[calc(100vw-2rem)]) and collapsed
  // into the More menu below xl. The audit measured 768px overflowing with full
  // labels; live measurement showed the full PL row needs ~1178px of content,
  // which only fits from the xl breakpoint (1280px) up.
  const overflowActions: OverflowAction[] = [
    {
      key: 'toggleFavorites',
      icon: <Heart className="w-4 h-4" />,
      label: t('toggleFavorites'),
      onClick: handleToggleFavorite,
    },
    ...(onRemoveFromPlaylist
      ? [
          {
            key: 'removeFromPlaylist',
            icon: <X className="w-4 h-4" />,
            label: t('removeFromPlaylist'),
            onClick: handleRemoveFromPlaylistClick,
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
          onClick={() => (allSelected ? clearSelection() : selectAll(trackList))}
          className={cn(
            'shrink-0 flex items-center justify-center md:justify-start gap-1.5 min-h-9 min-w-9 px-2 md:px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card'
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

        <ActionButton
          icon={<Play className="w-3.5 h-3.5" />}
          label={t('playNext')}
          onClick={handlePlayNext}
        />
        <ActionButton
          icon={<ListPlus className="w-3.5 h-3.5" />}
          label={t('addToQueue')}
          onClick={handleAddToQueue}
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
            onClick={handleToggleFavorite}
          />

          {onRemoveFromPlaylist && (
            <ActionButton
              icon={<X className="w-3.5 h-3.5" />}
              label={t('removeFromPlaylist')}
              onClick={handleRemoveFromPlaylistClick}
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
