import { useState, useCallback, useRef } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setIsOpen(false), isOpen);

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
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 bottom-full mb-1 w-48 py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20 z-50"
            onClick={e => e.stopPropagation()}
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
