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
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenuSide, setSubmenuSide] = useState<'right' | 'left'>('right');
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsSubmenuOpen(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      setIsSubmenuOpen(false);
    }, CLOSE_DELAY_MS);
  }, []);

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
    submenuRef,
    isSubmenuOpen,
    submenuClassName: cn(
      'absolute top-0 w-48 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20',
      submenuSide === 'right' ? 'left-full ml-0.5' : 'right-full mr-0.5'
    ),
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  };
}
