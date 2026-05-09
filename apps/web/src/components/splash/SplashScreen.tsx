import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';
import { useUIStore } from '@/stores/useUIStore';
import { useSplashScreen } from '@/hooks/useSplashScreen';
import { SplashWaveform } from './SplashWaveform';
import { SplashBlindSweep } from './SplashBlindSweep';
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
 * Shiranami splash — "Cassette / Late-Night Broadcast".
 *
 * Layout (centered column on a fixed inset-0 overlay):
 *  1. Field: --background with two radial glows + slow vignette rim.
 *  2. SplashBlindSweep: 30vw gradient strip sliding across over 11s.
 *  3. SplashWaveform: 64-bar radial waveform with 白波 wordmark centered inside.
 *  4. SplashFooter: status row (glowing dot + rotating copy) + bottom rail with EQ glyph.
 *
 * Exit transition: 540ms opacity → 0, scale → 1.015, blur 0 → 6px.
 */
export function SplashScreen({ isLoading, isError, error, onDismissed }: SplashScreenProps) {
  const lowPerformanceMode = useUIStore(s => s.lowPerformanceMode);

  const { isVisible, isDismissing, showStatus, variant, messageKey, version } = useSplashScreen({
    isLoading,
    isError,
    onDismissed,
  });

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden',
        IS_ELECTRON && 'rounded-t-[10px]'
      )}
      style={{
        transition: isDismissing
          ? 'opacity 540ms ease-out, transform 540ms ease-out, filter 540ms ease-out'
          : undefined,
        opacity: isDismissing ? 0 : 1,
        transform: isDismissing ? 'scale(1.015)' : 'scale(1)',
        filter: isDismissing ? 'blur(6px)' : 'blur(0px)',
      }}
    >
      {/* Drag region — keeps the frameless window movable during boot */}
      {IS_ELECTRON && <div className="absolute inset-x-0 top-0 h-8 drag" />}

      {/* Field radial glows */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* Primary glow — upper-center */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 1100px 900px at 50% 38%, oklch(from var(--primary) l c h / 0.12) 0%, transparent 70%)',
          }}
        />
        {/* Brand-600 glow — lower-center */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 1300px 600px at 50% 80%, oklch(from var(--brand-600) l c h / 0.08) 0%, transparent 75%)',
          }}
        />
        {/* Rim vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, oklch(from var(--background) calc(l - 0.04) c h / 0.6) 100%)',
          }}
        />
      </div>

      {/* Window-blind sweep */}
      <SplashBlindSweep disabled={lowPerformanceMode} />

      {/* Hero — radial waveform with wordmark */}
      <SplashWaveform
        paused={variant === 'error'}
        lowPerformanceMode={lowPerformanceMode}
        version={version}
      />

      {/* Status row + bottom rail */}
      <SplashFooter
        showStatus={showStatus}
        variant={variant}
        messageKey={messageKey}
        error={error}
      />
    </div>
  );
}
