import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ListPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { PlaylistPickerContent } from './PlaylistPickerContent';

interface AddToPlaylistButtonProps {
  trackId: string;
  className?: string;
}

export function AddToPlaylistButton({ trackId, className }: AddToPlaylistButtonProps) {
  const { t } = useTranslation('contextMenu');
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // Position the portal-based popover relative to the button
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverHeight = 240;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceAbove >= popoverHeight || spaceAbove > spaceBelow;

    setPopoverStyle({
      position: 'fixed',
      right: window.innerWidth - rect.right,
      ...(openAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      width: 192,
      zIndex: 50,
    });
  }, [isOpen]);

  // Close on click outside (checking both button and popover)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen]);

  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  return (
    <>
      <motion.button
        ref={buttonRef}
        whileTap={{ scale: 0.75 }}
        onClick={handleOpen}
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
              <PlaylistPickerContent
                trackIds={[trackId]}
                onDone={() => setIsOpen(false)}
                toastMode="single"
              />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
