// Dev-only React render-cost wrapper. In dev it mounts a `<Profiler onRender>`
// that feeds commit count + duration into the debug render-stats collector; in
// prod it returns `children` directly (no Profiler node, so it is a zero-cost
// pass-through that tree-shakes away).

import { Profiler } from 'react';
import { useDevProfiler } from './DevProfiler.hooks';
import type { IDevProfilerProps } from './DevProfiler.types';

export default function DevProfiler({ id, children }: IDevProfilerProps) {
  const { isDev, onRender } = useDevProfiler();

  if (!isDev) return <>{children}</>;

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
