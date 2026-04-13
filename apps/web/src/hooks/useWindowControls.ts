import { useCallback, useEffect, useState } from 'react';
import { IS_ELECTRON } from '@/lib/platform';

export interface UseWindowControlsResult {
  isMaximized: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

export function useWindowControls(): UseWindowControlsResult {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    void window.electronAPI.window.isMaximized().then(setIsMaximized);
    const unsub = window.electronAPI.window.onMaximizedChange(setIsMaximized);
    return unsub;
  }, []);

  const minimize = useCallback(() => {
    if (IS_ELECTRON) window.electronAPI.window.minimize();
  }, []);

  const maximize = useCallback(() => {
    if (IS_ELECTRON) window.electronAPI.window.maximize();
  }, []);

  const close = useCallback(() => {
    if (IS_ELECTRON) window.electronAPI.window.close();
  }, []);

  return { isMaximized, minimize, maximize, close };
}
