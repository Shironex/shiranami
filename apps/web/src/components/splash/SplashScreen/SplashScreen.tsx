import { SplashScene } from '../SplashScene';
import { SplashGlass } from '../SplashGlass';
import { SplashDroplets } from '../SplashDroplets';
import { SplashLamp } from '../SplashLamp';
import { SplashWordmark } from '../SplashWordmark';
import { SplashRain } from '../SplashRain';
import { SplashSteam } from '../SplashSteam';
import { SplashCup } from '../SplashCup';
import { SplashBrand } from '../SplashBrand';
import { SplashMeta } from '../SplashMeta';
import { useSplashScreen } from './SplashScreen.hooks';
import type { ISplashScreenProps } from './SplashScreen.types';

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
export default function SplashScreen(props: ISplashScreenProps) {
  const {
    isVisible,
    wrapperClassName,
    wrapperStyle,
    showDragRegion,
    disableBreathLoop,
    reducedMotion,
    lowPerformanceMode,
    rainPaused,
    showStatus,
    variant,
    messageKey,
    version,
    clock,
    error,
  } = useSplashScreen(props);

  if (!isVisible) return null;

  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      {/* Drag region — keeps the frameless window movable during boot */}
      {showDragRegion && <div className="absolute inset-x-0 top-0 h-8 drag" />}

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
        <SplashWordmark reducedMotion={disableBreathLoop} />
      </div>

      {/* z4 — static droplets + running streaks */}
      <div className="absolute inset-0 z-[4]">
        <SplashDroplets />
      </div>

      {/* z5 — rAF canvas rain (above the reflection) */}
      <div className="absolute inset-0 z-[5]">
        <SplashRain
          paused={rainPaused}
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
