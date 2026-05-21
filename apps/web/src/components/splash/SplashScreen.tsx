import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useUIStore } from '@/stores/useUIStore';
import { useSplashScreen } from '@/hooks/useSplashScreen';
import { SplashScene } from './SplashScene';
import { SplashLamp } from './SplashLamp';
import { SplashGlass } from './SplashGlass';
import { SplashWordmark } from './SplashWordmark';
import { SplashDroplets } from './SplashDroplets';
import { SplashRain } from './SplashRain';
import { SplashSteam } from './SplashSteam';
import { SplashCup } from './SplashCup';
import { SplashBrand } from './SplashBrand';
import { SplashMeta } from './SplashMeta';

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
 * Shiranami splash — "Cafe Window / Rain on Glass at night".
 *
 * Hybrid: production fullscreen shell (drag region, rounded-t, fog-out exit)
 * with a full-bleed night scene layered behind wet glass. Layer order
 * (z-bottom → z-top, explicit z-index on each layer):
 *  z1  SplashScene   — night sky + skyline + moon + flickering lights
 *  z2  SplashLamp    — broad ambient warm wash (breath-loop, off under degrade)
 *  z3  SplashWordmark— big off-center 白波 reflection (etch → fade entrance)
 *  z4  SplashDroplets— static clinging droplets + running streaks
 *  z5  SplashRain    — rAF canvas streaks (static frame under degrade)
 *  z6  SplashGlass   — film haze + edge vignette + texture mullion
 *  z7  SplashSteam   — rising steam (hidden under degrade)
 *  z8  SplashCup     — foreground coffee cup (static art)
 *  z9  SplashMeta    — top-right v{version} + live clock
 *  z9  SplashBrand   — bottom-left badge + LED + wordmark + kanji + loader + status
 *
 * Exit: 540ms opacity → 0, blur 0 → 8px (fog-out). No scale. Under
 * reduced-motion the blur is dropped (opacity-only).
 *
 * Degradation: every animated layer collapses to a static still under
 * reduced-motion OR lowPerformanceMode — flickering lights / LED / loader
 * sweep go static, steam + streaks hide, rain freezes one frame, lamp stops
 * breathing, and backdrop-filter is dropped (see globals.css guards).
 */
export function SplashScreen({ isLoading, isError, error, onDismissed }: SplashScreenProps) {
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);

  // Cached at mount — doesn't change during a 2.5s splash.
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const { isVisible, isDismissing, showStatus, variant, messageKey, version, clock } =
    useSplashScreen({
      isLoading,
      isError,
      onDismissed,
    });

  if (!isVisible) return null;

  const disableBreathLoop = reducedMotion || lowPerformanceMode;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] overflow-hidden bg-background',
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

      {/* z1 — night scene base */}
      <div className="absolute inset-0 z-[1]">
        <SplashScene reducedMotion={disableBreathLoop} />
      </div>

      {/* z2 — ambient warm lamp wash */}
      <div className="absolute inset-0 z-[2]">
        <SplashLamp disabled={disableBreathLoop} />
      </div>

      {/* z3 — big off-center 白波 reflection */}
      <div className="absolute inset-0 z-[3] pointer-events-none">
        <SplashWordmark reducedMotion={reducedMotion} />
      </div>

      {/* z4 — static droplets + running streaks */}
      <div className="absolute inset-0 z-[4]">
        <SplashDroplets />
      </div>

      {/* z5 — rAF canvas rain (above the reflection) */}
      <div className="absolute inset-0 z-[5]">
        <SplashRain
          paused={variant === 'error'}
          lowPerformanceMode={lowPerformanceMode}
          reducedMotion={reducedMotion}
        />
      </div>

      {/* z6 — glass surface cues: haze + edge vignette + texture mullion */}
      <div className="absolute inset-0 z-[6]">
        <SplashGlass />
      </div>

      {/* z7 — rising steam */}
      <div className="absolute inset-0 z-[7] pointer-events-none">
        <SplashSteam reducedMotion={disableBreathLoop} />
      </div>

      {/* z8 — foreground coffee cup */}
      <div className="absolute inset-0 z-[8] pointer-events-none">
        <SplashCup />
      </div>

      {/* z9 — UI: meta corner + brand block (interactive retry lives here) */}
      <SplashMeta version={version} clock={clock} />
      <SplashBrand
        showStatus={showStatus}
        variant={variant}
        messageKey={messageKey}
        error={error}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
