import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppVersionQuery } from '@/hooks/queries/useApp';

const MIN_DISPLAY_MS = 2500;
const EXIT_ANIMATION_MS = 540;
const SPINNER_DELAY_MS = 600;
const MESSAGE_ROTATE_MS = 1600;

const LOADING_MESSAGE_KEYS = [
  'loading1',
  'loading2',
  'loading3',
  'loading4',
  'loading5',
  'loading6',
] as const;

export type SplashMessageKey = (typeof LOADING_MESSAGE_KEYS)[number];

export type SplashVariant = 'loading' | 'error';

export interface SplashScreenState {
  /** Whether the splash overlay is mounted in the DOM. */
  isVisible: boolean;
  /** Whether the exit transition has started — apply exit CSS classes. */
  isDismissing: boolean;
  /** Whether the status row has faded in. */
  showStatus: boolean;
  variant: SplashVariant;
  /** Current rotating message key to translate. */
  messageKey: SplashMessageKey;
  /** App version string. */
  version: string;
}

interface UseSplashScreenOptions {
  /** Whether the library sync query is still running. */
  isLoading: boolean;
  /** Whether the library sync query errored. */
  isError: boolean;
  onDismissed?: () => void;
}

function randomStartIndex(): number {
  return Math.floor(Math.random() * LOADING_MESSAGE_KEYS.length);
}

export function useSplashScreen({
  isLoading,
  isError,
  onDismissed,
}: UseSplashScreenOptions): SplashScreenState {
  const { data: version = '' } = useAppVersionQuery();

  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [messageIndex, setMessageIndex] = useState(randomStartIndex);
  const hasDismissedRef = useRef(false);

  // Minimum display floor
  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Status row fade-in
  useEffect(() => {
    const t = setTimeout(() => setShowStatus(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Rotating status message (pause on error)
  useEffect(() => {
    if (isError) return;
    const t = setInterval(
      () => setMessageIndex(i => (i + 1) % LOADING_MESSAGE_KEYS.length),
      MESSAGE_ROTATE_MS
    );
    return () => clearInterval(t);
  }, [isError]);

  const handleDismiss = useCallback(() => {
    if (hasDismissedRef.current) return;
    hasDismissedRef.current = true;
    setIsDismissing(true);
    const t = setTimeout(() => {
      setIsVisible(false);
      onDismissed?.();
    }, EXIT_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [onDismissed]);

  const shouldDismiss = !isLoading && !isError && minTimeElapsed;

  useEffect(() => {
    if (!shouldDismiss) return;
    return handleDismiss();
  }, [shouldDismiss, handleDismiss]);

  const variant: SplashVariant = isError ? 'error' : 'loading';

  return {
    isVisible,
    isDismissing,
    showStatus,
    variant,
    messageKey: LOADING_MESSAGE_KEYS[messageIndex],
    version,
  };
}
