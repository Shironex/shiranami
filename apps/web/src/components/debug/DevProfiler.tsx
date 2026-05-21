// Dev-only React render-cost wrapper. In dev it mounts a `<Profiler onRender>`
// that feeds commit count + duration into the debug render-stats collector; in
// prod it returns `children` directly (no Profiler node, so it is a zero-cost
// pass-through that tree-shakes away).

import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';
import { recordRender } from '@/lib/debug/renderStats';

interface DevProfilerProps {
  id: string;
  children: ReactNode;
}

const onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  recordRender(id, actualDuration);
};

export function DevProfiler({ id, children }: DevProfilerProps) {
  if (!import.meta.env.DEV) return <>{children}</>;
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
