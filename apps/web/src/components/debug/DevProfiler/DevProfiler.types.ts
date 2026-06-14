import type { ProfilerOnRenderCallback, ReactNode } from 'react';

export interface IDevProfilerProps {
  /** Profiler id reported with each commit sample (groups stats per subtree). */
  readonly id: string;
  /** The subtree whose render cost is measured (passed through untouched in prod). */
  readonly children: ReactNode;
}

export interface IDevProfilerView {
  /** True in dev builds — gates whether the `<Profiler>` wrapper is mounted at all. */
  readonly isDev: boolean;
  /** Feeds commit count + duration into the debug render-stats collector. */
  readonly onRender: ProfilerOnRenderCallback;
}
