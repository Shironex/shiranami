import { useState, useCallback, useRef, useLayoutEffect, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { IAddToPlaylistButtonView } from './AddToPlaylistButton.types';

export function useAddToPlaylistButton(): IAddToPlaylistButtonView {
  const { t } = useTranslation('contextMenu');
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  // Position the portal-based popover relative to the button.
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

  // Close on click outside (checking both button and popover).
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

  const onToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(prev => !prev);
  }, []);

  return {
    t,
    isOpen,
    buttonRef,
    popoverRef,
    popoverStyle,
    onToggle,
    onClose: useCallback(() => setIsOpen(false), []),
  };
}
