import { useSplashWaveform } from '@/hooks/useSplashWaveform';
import { SplashWordmark } from './SplashWordmark';

const BAR_COUNT = 64;
const RING_RADIUS = 70;
const BAR_WIDTH = 3;
const SVG_SIZE = 240;
const CENTER = SVG_SIZE / 2;

interface SplashWaveformProps {
  paused: boolean;
  lowPerformanceMode: boolean;
  version: string;
}

/**
 * Radial waveform — 64 bars arranged on a circle of radius 70px, each bar
 * growing outward from the ring surface. Heights are driven by a sinusoid
 * ticker via useSplashWaveform. The 白波 wordmark sits centered inside the
 * ring via an absolutely-positioned overlay.
 *
 * Every 8th bar is an accent bar (brighter). Every 16th bar uses the warm
 * --favorite hue to pick up the only warm tone in the palette.
 *
 * aria-hidden — the wordmark below carries the accessible label.
 */
export function SplashWaveform({ paused, lowPerformanceMode, version }: SplashWaveformProps) {
  const heights = useSplashWaveform(paused, lowPerformanceMode);

  return (
    <div
      className="relative flex items-center justify-center animate-[shiranami-rise_800ms_cubic-bezier(0.32,0.72,0.24,1.08)_both]"
      style={{ width: SVG_SIZE + 60, height: SVG_SIZE + 60 }}
    >
      {/* Outer glow behind the waveform ring */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none animate-[shiranami-glow-breathe_6s_ease-in-out_infinite]"
        style={{
          background:
            'radial-gradient(ellipse 60% 60% at 50% 50%, oklch(from var(--primary) l c h / 0.18) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      {/* Radial bar SVG */}
      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        aria-hidden="true"
        style={{ position: 'absolute' }}
      >
        <defs>
          <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--brand-600)" />
          </linearGradient>
          <linearGradient id="bar-grad-accent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(from var(--primary) calc(l + 0.1) c h)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>

        {heights.map((h, i) => {
          const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
          const isWarm = i % 16 === 0;
          const isAccent = !isWarm && i % 8 === 0;

          // Bar origin sits on the ring surface; bar grows outward.
          const x = CENTER + Math.cos(angle) * RING_RADIUS;
          const y = CENTER + Math.sin(angle) * RING_RADIUS;
          const rotation = (angle * 180) / Math.PI + 90;

          return (
            <rect
              key={i}
              x={-BAR_WIDTH / 2}
              y={-h}
              width={BAR_WIDTH}
              height={h}
              rx={BAR_WIDTH / 2}
              fill={
                isWarm
                  ? 'oklch(from var(--favorite) l c h / 0.6)'
                  : isAccent
                    ? 'url(#bar-grad-accent)'
                    : 'url(#bar-grad)'
              }
              transform={`translate(${x}, ${y}) rotate(${rotation})`}
            />
          );
        })}
      </svg>

      {/* Wordmark centered in the ring */}
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
        <SplashWordmark version={version} />
      </div>
    </div>
  );
}
