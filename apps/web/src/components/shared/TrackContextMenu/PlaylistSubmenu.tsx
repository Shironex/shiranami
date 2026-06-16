import { useState, useEffect, useCallback, useRef } from 'react';
import { ListPlus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { PlaylistPickerContent } from '@/components/shared/PlaylistPickerContent';

export function PlaylistSubmenu({
  trackIds,
  onClose,
}: {
  trackIds: string[];
  onClose: () => void;
}) {
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
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!parentRef.current) return;
    const rect = parentRef.current.getBoundingClientRect();
    const submenuWidth = 192;
    if (rect.right + submenuWidth > window.innerWidth) {
      setSubmenuSide('left');
    }
  }, []);

  return (
    <div
      ref={parentRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left cursor-default',
          'text-foreground/80 hover:text-foreground hover:bg-accent'
        )}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
          <ListPlus className="w-4 h-4" />
        </span>
        {t('addToPlaylist')}
        <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground/40" />
      </div>

      {isSubmenuOpen && (
        <div
          ref={submenuRef}
          className={cn(
            'absolute top-0 w-48 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20',
            submenuSide === 'right' ? 'left-full ml-0.5' : 'right-full mr-0.5'
          )}
        >
          <PlaylistPickerContent trackIds={trackIds} onDone={onClose} />
        </div>
      )}
    </div>
  );
}
