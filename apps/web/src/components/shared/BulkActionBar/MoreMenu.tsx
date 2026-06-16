import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface IMenuActionProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
}

// Row inside the overflow popover. Mirrors the TrackContextMenu MenuItem idiom
// (~40px row, full label, destructive variant) so the two surfaces feel like
// one family.
function MenuAction({ icon, label, onClick, variant = 'default' }: IMenuActionProps) {
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

export interface IOverflowAction {
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
export function MoreMenu({ actions }: { actions: IOverflowAction[] }) {
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

  const rows = actions.map((action, i) => {
    const prev = actions[i - 1];
    const showDivider =
      Boolean(prev) && prev.variant !== 'destructive' && action.variant === 'destructive';
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
  });

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
              {rows}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
