import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { IPlaylistSubmenuProps, IPlaylistSubmenuView } from './PlaylistSubmenu.types';

// Panel width (`w-48`) mirrored in JS so the fly-out side can be decided from
// the row's rect before the panel exists.
const SUBMENU_WIDTH_PX = 192;
// Grace period between leaving the row and the panel closing, so a diagonal
// pointer path from the row into the panel does not dismiss it.
const CLOSE_DELAY_MS = 300;

export function usePlaylistSubmenu({
  trackIds,
  onClose,
}: IPlaylistSubmenuProps): IPlaylistSubmenuView {
  const { t } = useTranslation('contextMenu');
  const parentRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right');
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keyboard opens hand focus to the panel once it mounts; hover opens don't.
  const openedByKeyboardRef = useRef(false);

  const cancelPendingClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    cancelPendingClose();
    setIsSubmenuOpen(true);
  }, [cancelPendingClose]);

  const handleMouseLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      setIsSubmenuOpen(false);
    }, CLOSE_DELAY_MS);
  }, []);

  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
        event.preventDefault();
        cancelPendingClose();
        openedByKeyboardRef.current = true;
        setIsSubmenuOpen(true);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIsSubmenuOpen(false);
      }
    },
    [cancelPendingClose]
  );

  // After a keyboard open, move focus into the panel so the picker is
  // immediately operable (the roving track-menu focus stays on the row
  // otherwise).
  useEffect(() => {
    if (!isSubmenuOpen || !openedByKeyboardRef.current) return;
    openedByKeyboardRef.current = false;
    const first = submenuRef.current?.querySelector<HTMLElement>('button:not([disabled]), input');
    first?.focus({ preventScroll: true });
  }, [isSubmenuOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!parentRef.current) return;
    const rect = parentRef.current.getBoundingClientRect();
    if (rect.right + SUBMENU_WIDTH_PX > window.innerWidth) {
      setSubmenuSide('left');
    }
  }, []);

  return {
    label: t('addToPlaylist'),
    trackIds,
    onClose,
    parentRef,
    rowRef,
    submenuRef,
    isSubmenuOpen,
    submenuClassName: cn(
      'absolute top-0 w-48 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20',
      submenuSide === 'right' ? 'left-full ml-0.5' : 'right-full mr-0.5'
    ),
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onRowKeyDown: handleRowKeyDown,
  };
}
