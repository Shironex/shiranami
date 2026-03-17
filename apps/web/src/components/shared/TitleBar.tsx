import { useState, useEffect, useCallback } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!IS_ELECTRON) return;
    window.electronAPI?.window.isMaximized().then(setIsMaximized);
    const cleanup = window.electronAPI?.window.onMaximizedChange(setIsMaximized);
    return cleanup;
  }, []);

  const handleMinimize = useCallback(() => {
    window.electronAPI?.window.minimize();
  }, []);

  const handleMaximize = useCallback(() => {
    window.electronAPI?.window.maximize();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.window.close();
  }, []);

  if (IS_MAC) {
    return (
      <div className="drag h-8 flex items-center px-3 bg-sidebar border-b border-border shrink-0">
        <div className="flex-1" />
        <span className="text-xs font-medium text-muted-foreground select-none">Shiranami</span>
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="drag h-8 flex items-center bg-sidebar border-b border-border shrink-0 select-none">
      <div className="no-drag flex items-center px-3 gap-1.5">
        <span className="text-xs font-semibold text-foreground">Shiranami</span>
      </div>

      <div className="flex-1" />

      <div className="no-drag flex items-stretch h-full">
        <button
          onClick={handleMinimize}
          className={cn(
            'w-11 flex items-center justify-center',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            'transition-colors duration-150'
          )}
          aria-label="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className={cn(
            'w-11 flex items-center justify-center',
            'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            'transition-colors duration-150'
          )}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy className="w-3 h-3" /> : <Square className="w-3 h-3" />}
        </button>
        <button
          onClick={handleClose}
          className={cn(
            'w-11 flex items-center justify-center',
            'text-muted-foreground hover:bg-destructive hover:text-destructive-foreground',
            'transition-colors duration-150'
          )}
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
