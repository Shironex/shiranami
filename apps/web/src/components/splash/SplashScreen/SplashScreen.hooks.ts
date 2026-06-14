import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useUIStore } from '@/stores/useUIStore';
import { useSplashScreen as useSplashScreenState } from '@/hooks/useSplashScreen';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { ISplashScreenProps, ISplashScreenView } from './SplashScreen.types';

function buildWrapperStyle(isDismissing: boolean, disableBreathLoop: boolean): CSSProperties {
  const exitBlur = disableBreathLoop ? 'blur(0px)' : 'blur(8px)';
  return {
    transition: isDismissing ? 'opacity 540ms ease-out, filter 540ms ease-out' : undefined,
    opacity: isDismissing ? 0 : 1,
    filter: isDismissing ? exitBlur : 'blur(0px)',
  };
}

export function useSplashScreen({
  isLoading,
  isError,
  error,
  onDismissed,
}: ISplashScreenProps): ISplashScreenView {
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);

  // Cached at mount — doesn't change during a 2.5s splash.
  const reducedMotion = useReducedMotion();

  const { isVisible, isDismissing, showStatus, variant, messageKey, version, clock } =
    useSplashScreenState({ isLoading, isError, onDismissed });

  const disableBreathLoop = reducedMotion || lowPerformanceMode;

  return {
    isVisible,
    wrapperClassName: cn(
      'fixed inset-0 z-[9999] overflow-hidden bg-background',
      IS_ELECTRON && 'rounded-t-[10px]'
    ),
    wrapperStyle: buildWrapperStyle(isDismissing, disableBreathLoop),
    showDragRegion: IS_ELECTRON,
    disableBreathLoop,
    reducedMotion,
    lowPerformanceMode,
    rainPaused: variant === 'error',
    showStatus,
    variant,
    messageKey,
    version,
    clock,
    error,
  };
}
