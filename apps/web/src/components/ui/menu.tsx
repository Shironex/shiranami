import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { MENU_POP } from '@/lib/motion';

/** A pause this long resets the typeahead buffer. */
const TYPEAHEAD_RESET_MS = 500;

interface IMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Focus the menu container on mount and restore focus to the previously
   * focused element on unmount. Context menus opened at a pointer position
   * need this; popover-anchored menus let the popover own focus instead.
   */
  autoFocus?: boolean;
  /** Called when the user tabs away — the host should close the menu. */
  onRequestClose?: () => void;
  ref?: React.Ref<HTMLDivElement | null>;
}

/**
 * The keyboard-navigable menu container: `role=menu` with roving arrow-key
 * focus over its `MenuItem`s (wrap-around, Home/End), label typeahead, and
 * close-on-Tab. Escape stays with the host (context-menu dismiss hook or the
 * popover primitive), which already owns outside-click dismissal too.
 */
function Menu({
  autoFocus = false,
  onRequestClose,
  className,
  onKeyDown,
  ref,
  children,
  ...props
}: IMenuProps) {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const typeaheadRef = React.useRef({ query: '', at: 0 });

  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  React.useEffect(() => {
    if (!autoFocus) return;
    const previous = document.activeElement;
    innerRef.current?.focus({ preventScroll: true });
    return () => {
      if (!(previous instanceof HTMLElement) || !previous.isConnected) return;
      // Only restore when focus is still ours to give back — never steal it
      // from wherever the user has moved on to.
      const active = document.activeElement;
      const menuOwnsFocus =
        active === null || active === document.body || Boolean(innerRef.current?.contains(active));
      if (menuOwnsFocus) previous.focus({ preventScroll: true });
    };
  }, [autoFocus]);

  const enabledItems = (): HTMLElement[] => {
    const node = innerRef.current;
    if (!node) return [];
    return Array.from(node.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
      el => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true'
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const node = innerRef.current;
    if (!node) return;
    // Only steer keys while focus sits on the menu itself or one of its items —
    // a fly-out panel (pickers, inputs) keeps its own keyboard handling.
    const target = event.target as HTMLElement;
    if (target !== node && target.getAttribute('role') !== 'menuitem') return;

    const items = enabledItems();
    if (items.length === 0) return;
    const currentIndex = items.indexOf(target);

    const focusItem = (index: number) => {
      items[(index + items.length) % items.length]?.focus({ preventScroll: true });
    };

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(currentIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(currentIndex === -1 ? items.length - 1 : currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case 'Tab':
        // Menus close on Tab instead of joining the page's tab order.
        event.preventDefault();
        onRequestClose?.();
        break;
      default: {
        // Typeahead. Space is excluded — it activates the focused item.
        if (event.key.length !== 1 || event.key === ' ') return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const now = Date.now();
        const stale = now - typeaheadRef.current.at > TYPEAHEAD_RESET_MS;
        const query = (stale ? '' : typeaheadRef.current.query) + event.key.toLowerCase();
        typeaheadRef.current = { query, at: now };

        const start = currentIndex + 1;
        const lookup = (q: string): HTMLElement | undefined => {
          for (let i = 0; i < items.length; i++) {
            const item = items[(start + i) % items.length];
            if ((item.textContent ?? '').trim().toLowerCase().startsWith(q)) return item;
          }
          return undefined;
        };
        // Repeating one letter cycles through that letter's items instead of
        // demanding an exact "aa..." prefix.
        const repeatedChar = query.length > 1 && new Set(query).size === 1;
        const match = lookup(query) ?? (repeatedChar ? lookup(query[0]) : undefined);
        match?.focus({ preventScroll: true });
      }
    }
  };

  return (
    <div
      {...props}
      ref={setRefs}
      role="menu"
      aria-orientation="vertical"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={cn('py-1 outline-none', className)}
    >
      {children}
    </div>
  );
}

type MenuItemVariant = 'default' | 'destructive';

interface IMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Leading 16px icon slot, tinted muted like every menu row. */
  icon?: React.ReactNode;
  variant?: MenuItemVariant;
}

const MENU_ITEM_VARIANT_CLASSES: Record<MenuItemVariant, string> = {
  default:
    'text-foreground/80 hover:text-foreground hover:bg-accent focus:text-foreground focus:bg-accent active:bg-accent/70',
  destructive:
    'text-destructive hover:bg-destructive/10 focus:bg-destructive/10 active:bg-destructive/20',
};

function MenuItem({
  icon,
  variant = 'default',
  disabled = false,
  className,
  onMouseEnter,
  children,
  ...props
}: IMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onMouseEnter={event => {
        // A menu keeps a single highlighted row: hover pulls focus so the
        // keyboard position follows the pointer and vice versa.
        if (!disabled) event.currentTarget.focus({ preventScroll: true });
        onMouseEnter?.(event);
      }}
      className={cn(
        'focus-ring w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
        disabled
          ? 'text-muted-foreground/50 cursor-not-allowed'
          : MENU_ITEM_VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {icon !== undefined && (
        <span className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground/60">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

function MenuDivider({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn('my-1 border-t border-border/50', className)}
      {...props}
    />
  );
}

/** Non-interactive heading row (e.g. the bulk-selection count). */
function MenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-3 py-1.5 text-xs text-muted-foreground/50 font-medium', className)}
      {...props}
    />
  );
}

interface IContextMenuSurfaceProps {
  /** Ref to the positioned surface — the dismiss hook measures and watches it. */
  menuRef: React.RefObject<HTMLDivElement | null>;
  /** Viewport-adjusted position from `useContextMenuDismiss`. */
  position: { x: number; y: number };
  className?: string;
  children: React.ReactNode;
}

/**
 * The floating chrome shared by every right-click menu: a body portal, the
 * fixed viewport position, the card surface, and the MENU_POP enter/exit.
 * Wrap a `Menu` in it; dismissal stays with `useContextMenuDismiss`.
 */
function ContextMenuSurface({ menuRef, position, className, children }: IContextMenuSurfaceProps) {
  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        {...MENU_POP}
        className={cn(
          'fixed z-50 min-w-[200px] rounded-xl bg-card border border-border/50 shadow-xl shadow-black/30',
          className
        )}
        style={{ left: position.x, top: position.y, transformOrigin: 'top left' }}
        onContextMenu={(event: React.MouseEvent) => event.preventDefault()}
      >
        {children}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export { Menu, MenuItem, MenuDivider, MenuLabel, ContextMenuSurface };
