import type { ISplashSceneLight, ISplashSceneProps, ISplashSceneView } from './SplashScene.types';

// Distant warm window lights — percentage positions mirror the mock's spread
// across the lower-third skyline band. `big` marks the two taller windows.
const LIGHTS: readonly ISplashSceneLight[] = [
  { left: '8%', top: '62%' },
  { left: '14%', top: '66%', even: true },
  { left: '18%', top: '60%' },
  { left: '24%', top: '64%', even: true },
  { left: '31%', top: '58%' },
  { left: '36%', top: '62%', big: true, even: true },
  { left: '42%', top: '65%' },
  { left: '48%', top: '63%', even: true },
  { left: '56%', top: '67%' },
  { left: '62%', top: '60%', even: true },
  { left: '68%', top: '64%' },
  { left: '73%', top: '58%', even: true },
  { left: '79%', top: '62%', big: true },
  { left: '86%', top: '66%', even: true },
  { left: '92%', top: '60%' },
];

export function useSplashScene({ reducedMotion }: ISplashSceneProps): ISplashSceneView {
  return { reducedMotion, lights: LIGHTS };
}
