import { SplashScene } from '@/components/splash/SplashScene';
import { SplashGlass } from '@/components/splash/SplashGlass';
import { SplashDroplets } from '@/components/splash/SplashDroplets';

interface IOnboardingSceneProps {
  /** When true, the scene's only animated sub-layer (window flicker) is frozen. */
  readonly reducedMotion: boolean;
}

/**
 * Rainy-window backdrop for the onboarding wizard, composed from the splash's
 * already-tuned static layers (night scene + clinging droplets + wet glass)
 * rather than authoring a new rAF loop. The animated rain/steam/lamp layers are
 * deliberately omitted — onboarding is a longer-lived overlay than the 2.5s
 * splash, so we keep it cheap. The droplets' running streaks self-degrade to
 * static under reduced-motion / low-perf via their globals.css class guards.
 */
export function OnboardingScene({ reducedMotion }: IOnboardingSceneProps) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-background" aria-hidden="true">
      <div className="absolute inset-0 z-[1]">
        <SplashScene reducedMotion={reducedMotion} />
      </div>
      <div className="absolute inset-0 z-[2]">
        <SplashDroplets />
      </div>
      <div className="absolute inset-0 z-[3]">
        <SplashGlass />
      </div>
    </div>
  );
}
