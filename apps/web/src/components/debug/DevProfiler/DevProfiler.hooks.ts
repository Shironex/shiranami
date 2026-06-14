import type { ProfilerOnRenderCallback } from 'react';
import { recordRender } from '@/lib/debug/renderStats';
import type { IDevProfilerView } from './DevProfiler.types';

const onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  recordRender(id, actualDuration);
};

export function useDevProfiler(): IDevProfilerView {
  return {
    isDev: import.meta.env.DEV,
    onRender,
  };
}
