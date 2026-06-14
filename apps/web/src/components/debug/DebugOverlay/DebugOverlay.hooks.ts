import { useDebugStore } from '@/stores/useDebugStore';
import type { IDebugOverlayView } from './DebugOverlay.types';

export function useDebugOverlay(): IDebugOverlayView {
  // Narrow selectors so the panel itself re-renders minimally.
  const main = useDebugStore(s => s.main);
  const renderer = useDebugStore(s => s.renderer);
  const longTasks = useDebugStore(s => s.longTasks);
  const close = useDebugStore(s => s.close);

  return { main, renderer, longTasks, close };
}
