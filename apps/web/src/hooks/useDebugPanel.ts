// Dev-only glue for the CPU/Perf Debug Panel.
//
// Installs the timer registry once at first mount, registers the Ctrl+Shift+D
// toggle, drives the renderer instrumentation off the store's `open` flag, and
// exposes `open` for conditional rendering of the overlay. The whole hook is a
// no-op outside dev (`import.meta.env.DEV`), so the toggle, listeners, and
// monkeypatch are tree-shaken from production builds.

import { useEffect } from 'react';
import { useDebugStore } from '@/stores/useDebugStore';
import { useDebugInstrumentation } from '@/hooks/useDebugInstrumentation';
import { installTimerRegistry } from '@/lib/debug/timerRegistry';

let registryInstalled = false;

export function useDebugPanel(): boolean {
  const open = useDebugStore(s => s.open);
  const enabled = import.meta.env.DEV;

  useEffect(() => {
    if (!enabled) return;
    if (!registryInstalled) {
      installTimerRegistry();
      registryInstalled = true;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        useDebugStore.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  useDebugInstrumentation(enabled && open);

  return enabled && open;
}
