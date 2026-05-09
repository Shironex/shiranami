import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useUIStore } from '@/stores/useUIStore';
import { useSplashScreen } from '@/hooks/useSplashScreen';
import { SplashLamp } from './SplashLamp';
import { SplashGlass } from './SplashGlass';
import { SplashWordmark } from './SplashWordmark';
import { SplashRain } from './SplashRain';
import { SplashFooter } from './SplashFooter';

interface SplashScreenProps {
  /** Library sync is still running — splash stays mounted until false. */
  isLoading: boolean;
  /** Library sync errored — switches to the error variant. */
  isError: boolean;
  /** Error message to display in the error variant. */
  error?: string | null;
  onDismissed?: () => void;
}

/**
 * Shiranami splash — "Cafe Window / Rain on Glass".
 *
 * Layer order (z-bottom → z-top):
 *  1. Canvas: bare --background. No additive wash.
 *  2. SplashLamp: single warm --favorite radial glow at (82%, 18%).
 *  3. SplashGlass: monochrome top/bottom film haze.
 *  4. SplashWordmark: 白波 etched on the glass, receding at 0.55 alpha.
 *  5. SplashRain: full-bleed canvas streaks — sits above the wordmark so
 *     rain reads as falling between the viewer and the etching.
 *  6. SplashFooter: absolute bottom, above the rain layer.
 *
 * Exit: 540ms opacity → 0, blur 0 → 8px (fog-out). No scale.
 * Palette rule: --primary appears only on the status dot. No other violet.
 */
export function SplashScreen({ isLoading, isError, error, onDismissed }: SplashScreenProps) {
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);

  // Cached at mount — doesn't change during a 2.5s splash.
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const { isVisible, isDismissing, showStatus, variant, messageKey, version } = useSplashScreen({
    isLoading,
    isError,
    onDismissed,
  });

  if (!isVisible) return null;

  const disableBreathLoop = reducedMotion || lowPerformanceMode;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden',
        IS_ELECTRON && 'rounded-t-[10px]'
      )}
      style={{
        transition: isDismissing ? 'opacity 540ms ease-out, filter 540ms ease-out' : undefined,
        opacity: isDismissing ? 0 : 1,
        filter: isDismissing ? (reducedMotion ? 'blur(0px)' : 'blur(8px)') : 'blur(0px)',
      }}
    >
      {/* Drag region — keeps the frameless window movable during boot */}
      {IS_ELECTRON && <div className="absolute inset-x-0 top-0 h-8 drag" />}

      {/* Layer 1 & 2: Lamp + Glass film (below wordmark) */}
      <SplashLamp disabled={disableBreathLoop} />
      <SplashGlass />

      {/* Layer 3: Wordmark — centered, slightly above true vertical center */}
      <div
        className="relative z-10 flex flex-col items-center justify-center pointer-events-none"
        style={{ marginTop: '-2vh' }}
      >
        <SplashWordmark reducedMotion={reducedMotion} />
      </div>

      {/* Layer 4: Rain canvas — above the wordmark */}
      <SplashRain
        paused={variant === 'error'}
        lowPerformanceMode={lowPerformanceMode}
        reducedMotion={reducedMotion}
      />

      {/* Layer 5: Footer — above the rain */}
      <SplashFooter
        showStatus={showStatus}
        variant={variant}
        messageKey={messageKey}
        error={error}
        version={version}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
