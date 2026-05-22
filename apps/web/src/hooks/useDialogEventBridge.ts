import { useEffect, useState } from 'react';
import type { DialogEventName } from '@/lib/dialogEvents';

interface DialogEventBridge<TDetail> {
  /** Whether the bound dialog should currently be open. */
  open: boolean;
  /** Controlled setter to pass to the dialog's `onOpenChange`. */
  setOpen: (open: boolean) => void;
  /** The detail payload from the most recent open event, or null before any. */
  request: TDetail | null;
}

/**
 * Subscribe to a `window` CustomEvent used as a dialog-open signal. When the
 * event fires, stores its `detail` as the active request and flips `open` to
 * true. Returns the controlled open state + setter + last request so a manager
 * component can render its dialog without re-implementing the listener.
 *
 * Replaces the duplicated `useEffect(addEventListener(...))` blocks in
 * ShareDialogManager and TrackEnrichDialogManager.
 */
export function useDialogEventBridge<TDetail = undefined>(
  eventName: DialogEventName
): DialogEventBridge<TDetail> {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<TDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      setRequest((e as CustomEvent<TDetail>).detail ?? null);
      setOpen(true);
    };
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [eventName]);

  return { open, setOpen, request };
}
