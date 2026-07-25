import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMoreMenu } from './MoreMenu.hooks';
import type { IMoreMenuProps } from './MoreMenu.types';

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

/**
 * Overflow trigger + popover for the bulk dock's collapsed actions. The popover
 * is portalled to `document.body` so it escapes the dock's `overflow-x-auto`
 * clip, and is dismissed by Escape or an outside mousedown.
 */
export default function MoreMenu(props: IMoreMenuProps) {
  const { moreLabel, isOpen, buttonRef, popoverRef, popoverStyle, onToggle, rows } =
    useMoreMenu(props);

  const menuRows = rows.map(row => (
    <div key={row.key} role="none">
      {row.showDivider && <Divider />}
      <MenuAction icon={row.icon} label={row.label} variant={row.variant} onClick={row.onSelect} />
    </div>
  ));

  return (
    <>
      <motion.button
        ref={buttonRef}
        whileTap={{ scale: 0.92 }}
        onClick={onToggle}
        className={cn(
          'shrink-0 flex items-center justify-center min-h-9 min-w-9 p-1.5 rounded-lg text-xs font-medium transition-colors',
          'text-foreground/70 hover:text-foreground hover:bg-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
          isOpen && 'text-foreground bg-accent'
        )}
        title={moreLabel}
        aria-label={moreLabel}
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
              aria-label={moreLabel}
              initial={{ opacity: 0, scale: 0.95, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 6 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="py-1 rounded-xl bg-card border border-border/50 shadow-xl shadow-black/30"
              style={{ ...popoverStyle, transformOrigin: 'bottom right' }}
            >
              {menuRows}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
