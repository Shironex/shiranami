import { useState, useCallback, useRef, useLayoutEffect } from 'react';
import { ListPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useClickOutside } from '@/hooks/useClickOutside';
import { PlaylistPickerContent } from './PlaylistPickerContent';

interface AddToPlaylistButtonProps {
  trackId: string;
  className?: string;
}

export function AddToPlaylistButton({ trackId, className }: AddToPlaylistButtonProps) {
  const { t } = useTranslation('contextMenu');
  const [isOpen, setIsOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setIsOpen(false), isOpen);

  // Decide direction before paint: open above if enough space, otherwise below
  useLayoutEffect(() => {
    if (!isOpen || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const popoverHeight = 240; // approximate max height of picker
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    setOpenAbove(spaceAbove >= popoverHeight || spaceAbove > spaceBelow);
  }, [isOpen]);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.75 }}
        onClick={handleOpen}
        className={cn(
          'shrink-0 p-1 rounded-md transition-colors duration-150',
          'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60',
          className,
        )}
        aria-label={t('addToPlaylistAria')}
      >
        <ListPlus className="w-3.5 h-3.5" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.9, y: openAbove ? -4 : 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: openAbove ? -4 : 4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute right-0 w-48 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50',
              openAbove ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <PlaylistPickerContent
              trackIds={[trackId]}
              onDone={() => setIsOpen(false)}
              toastMode="single"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
