import { createPortal } from 'react-dom';
import { ListPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { PlaylistPickerContent } from '@/components/shared/PlaylistPickerContent';
import { useAddToPlaylistButton } from './AddToPlaylistButton.hooks';
import type { IAddToPlaylistButtonProps } from './AddToPlaylistButton.types';

export default function AddToPlaylistButton({ trackId, className }: IAddToPlaylistButtonProps) {
  const { t, isOpen, buttonRef, popoverRef, popoverStyle, onToggle, onClose } =
    useAddToPlaylistButton();

  return (
    <>
      <motion.button
        ref={buttonRef}
        whileTap={{ scale: 0.75 }}
        onClick={onToggle}
        className={cn(
          'shrink-0 p-1 rounded-md transition-colors duration-150',
          'text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-muted-foreground/60',
          className
        )}
        aria-label={t('addToPlaylistAria')}
      >
        <ListPlus className="w-3.5 h-3.5" />
      </motion.button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              ref={popoverRef}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.12 }}
              className="py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/20"
              style={popoverStyle}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <PlaylistPickerContent trackIds={[trackId]} onDone={onClose} toastMode="single" />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
