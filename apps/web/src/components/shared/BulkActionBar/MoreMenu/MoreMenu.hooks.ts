import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { IMoreMenuProps, IMoreMenuRow, IMoreMenuView } from './MoreMenu.types';

// The popover is portalled to document.body with fixed positioning derived from
// the trigger's rect so it escapes the dock's `overflow-x-auto` clip. Its right
// edge pins to the trigger's, clamped to this inset so it never bleeds off the
// left of a 360px viewport.
const POPOVER_MIN_WIDTH_PX = 200;
const VIEWPORT_INSET_PX = 8;
const TRIGGER_GAP_PX = 8;

export function useMoreMenu({ actions }: IMoreMenuProps): IMoreMenuView {
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
      right: Math.max(window.innerWidth - rect.right, VIEWPORT_INSET_PX),
      // Open above the dock — there is rarely space below the bottom-24 dock.
      bottom: window.innerHeight - rect.top + TRIGGER_GAP_PX,
      minWidth: POPOVER_MIN_WIDTH_PX,
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
    // Deferred a tick so the click that opened the popover does not immediately
    // reach the outside-click handler and close it again.
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

  const onToggle = useCallback(() => setIsOpen(prev => !prev), []);

  const rows: IMoreMenuRow[] = actions.map((action, i) => {
    const prev = actions[i - 1];
    // A separator opens the destructive group: the first destructive row that
    // follows a non-destructive one.
    const showDivider =
      Boolean(prev) && prev.variant !== 'destructive' && action.variant === 'destructive';
    return {
      key: action.key,
      icon: action.icon,
      label: action.label,
      variant: action.variant,
      showDivider,
      onSelect: () => handleAction(action.onClick),
    };
  });

  return {
    moreLabel: tCommon('more'),
    isOpen,
    buttonRef,
    popoverRef,
    popoverStyle,
    onToggle,
    rows,
  };
}
