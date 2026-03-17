import { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, AlertCircle, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON } from '@/lib/platform';

const MIN_DISPLAY_MS = 2500;
const EXIT_ANIMATION_MS = 600;
const SPINNER_DELAY_MS = 600;
const MESSAGE_ROTATE_MS = 1400;

const LOADING_MESSAGES = [
  'Tuning the instruments...',
  'Loading your library...',
  'Setting up the stage...',
  'Warming up the speakers...',
  'Finding the perfect beat...',
  'Almost ready to play...',
];

function randomStartIndex() {
  return Math.floor(Math.random() * LOADING_MESSAGES.length);
}

const SPARKLE_COUNT = 8;

function useSparkles() {
  return useMemo(
    () =>
      Array.from({ length: SPARKLE_COUNT }, (_, i) => {
        const angle = (i / SPARKLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
        const radius = 50 + Math.random() * 70;
        return {
          id: i,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          size: 2 + Math.random() * 3,
          delay: Math.random() * 2,
          duration: 1.5 + Math.random() * 1.5,
        };
      }),
    []
  );
}

interface SplashScreenProps {
  ready: boolean;
  error: string | null;
  onDismissed?: () => void;
}

export function SplashScreen({ ready, error, onDismissed }: SplashScreenProps) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [messageIndex, setMessageIndex] = useState(randomStartIndex);
  const hasDismissedRef = useRef(false);
  const sparkles = useSparkles();

  const shouldDismiss = ready && minTimeElapsed;

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (error) return;
    const timer = setInterval(
      () => setMessageIndex(i => (i + 1) % LOADING_MESSAGES.length),
      MESSAGE_ROTATE_MS
    );
    return () => clearInterval(timer);
  }, [error]);

  useEffect(() => {
    if (!shouldDismiss || hasDismissedRef.current) return;
    hasDismissedRef.current = true;
    setIsDismissing(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
      onDismissed?.();
    }, EXIT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [shouldDismiss, onDismissed]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden',
        'transition-[opacity,transform] duration-600 ease-out',
        isDismissing && 'opacity-0 scale-[1.02]',
        IS_ELECTRON && 'rounded-t-[10px]'
      )}
    >
      {IS_ELECTRON && <div className="absolute inset-x-0 top-0 h-8 drag" />}

      <div className="flex flex-col items-center justify-center gap-3">
        <div className="relative animate-[splash-bounce-in_0.7s_cubic-bezier(0.34,1.56,0.64,1)_both]">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-32 h-32 rounded-full bg-primary/10 blur-3xl animate-pulse-subtle" />
          </div>

          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            {sparkles.map(s => (
              <div
                key={s.id}
                className="absolute rounded-full bg-primary"
                style={{
                  left: `calc(50% + ${s.x}px)`,
                  top: `calc(50% + ${s.y}px)`,
                  width: s.size,
                  height: s.size,
                  animation: `splash-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite both`,
                }}
              />
            ))}
          </div>

          <div className="relative w-28 h-28 flex items-center justify-center animate-[splash-float_3s_ease-in-out_0.7s_infinite]">
            <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center">
              <Music className="w-10 h-10 text-primary" />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-0.5 animate-[splash-fade-up_0.8s_ease-out_0.3s_both]">
          <span className="text-2xl font-bold tracking-tight text-foreground">白波</span>
          <span className="text-[10px] text-muted-foreground/50 tracking-[0.25em] uppercase font-medium">
            Shiranami
          </span>
        </div>

        <div
          className={cn(
            'mt-4 flex flex-col items-center gap-2.5 transition-opacity duration-400 ease-in',
            showSpinner ? 'opacity-100' : 'opacity-0'
          )}
          role="status"
          aria-live="polite"
        >
          {error ? (
            <div className="flex flex-col items-center gap-3 max-w-xs text-center animate-fade-in">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-destructive" aria-hidden="true" />
              </div>
              <p className="text-destructive text-sm">{error}</p>
              <button
                type="button"
                className="text-sm text-primary hover:underline cursor-pointer"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 animate-[splash-fade-up_0.6s_ease-out_0.8s_both]">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <p
                key={messageIndex}
                className="text-muted-foreground text-sm animate-[splash-msg-swap_0.4s_ease-out_both]"
              >
                {LOADING_MESSAGES[messageIndex]}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
